import { useEffect, useMemo, useRef, useCallback, useState, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BlockData } from '@/shared/types'
import { getBlockColor } from '@/utils/blockColor'
import { BlockContentRenderer } from '@/components/preview/BlockContentRenderer'
import { TranslationView } from '@/components/preview/TranslationView'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'
import { useEditorStore } from '@/stores/editorStore'
import { useTranslate } from '@/hooks/useTranslate'
import { translateService } from '@/service/translate.service'
import { Toast } from '@douyinfe/semi-ui'

interface MarkdownBlockViewProps {
  blockData: BlockData[][] | null
  theme?: MarkdownTheme
  imageBasePath?: string
}

type ListItem =
  | { kind: 'separator'; pageIdx: number; key: string }
  | { kind: 'block'; block: BlockData; pageIdx: number; key: string }

interface BlockItemProps {
  block: BlockData; pageIdx: number; theme: MarkdownTheme; imageBasePath?: string
  isActive: boolean; isEditing: boolean; isEdited: boolean
  onBlockClick: (block: BlockData) => void; onBlockDoubleClick: (block: BlockData) => void
  onContextMenu: (e: React.MouseEvent, block: BlockData) => void
}

const BlockItem = memo(function BlockItem({ block, theme, imageBasePath, isActive, isEditing, isEdited, onBlockClick, onBlockDoubleClick, onContextMenu }: BlockItemProps) {
  const color = getBlockColor(block.type)
  return (
    <div data-block-id={block.id}
      className={`md-block-box${isActive ? ' active' : ''}${isEditing ? ' annotation-box--editing' : ''}${block.is_discarded ? ' discarded' : ''}`}
      style={{ '--md-block-line': isActive ? '#1677ff' : color.line, '--md-block-fill': isActive ? 'rgba(22, 119, 255, 0.08)' : color.fill } as React.CSSProperties}
      onClick={() => onBlockClick(block)} onDoubleClick={() => onBlockDoubleClick(block)}
      onContextMenu={(e) => onContextMenu(e, block)}>
      <span className="md-block-type-label">{block.type}</span>
      {isEdited && <span className="md-block-edited-tag">已编辑</span>}
      <div className="block-section-text prose-sm">
        {block.is_discarded && ['header','footer','page_number','aside_text','page_footnote'].includes(block.type)
          ? <span className="text-gray-300 italic text-xs">已丢弃 ({block.type})</span>
          : <BlockContentRenderer block={block} theme={theme} imageBasePath={imageBasePath} hideCopyButton />}
      </div>
      <TranslationView blockId={block.id} blockPosition={block.block_position} currentSourceText={block.text} theme={theme} />
    </div>
  )
})

export function MarkdownBlockView({ blockData, theme = 'base', imageBasePath }: MarkdownBlockViewProps) {
  const activeBlockId = useEditorStore((s) => s.activeBlockId)
  const activeBlockSource = useEditorStore((s) => s.activeBlockSource)
  const setActiveBlockId = useEditorStore((s) => s.setActiveBlockId)
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage)
  const editInfo = useEditorStore((s) => s.editInfo)
  const setEditInfo = useEditorStore((s) => s.setEditInfo)
  const editedBlocks = useEditorStore((s) => s.editedBlocks)
  const { translateSelection } = useTranslate()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string; selectedText: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInfoRef = useRef(editInfo)
  const programmaticScrollRef = useRef(false)
  const scrollRafRef = useRef<number>(0)
  useEffect(() => { editInfoRef.current = editInfo }, [editInfo])

  const items = useMemo<ListItem[]>(() => {
    if (!blockData || blockData.length === 0) return []
    const result: ListItem[] = []
    for (let pgIdx = 0; pgIdx < blockData.length; pgIdx++) {
      const pageBlocks = blockData[pgIdx]
      if (pageBlocks.length === 0) continue
      if (pgIdx > 0 && blockData.length > 1) result.push({ kind: 'separator', pageIdx: pgIdx, key: `sep-${pgIdx}` })
      for (let bi = 0; bi < pageBlocks.length; bi++) {
        const block = pageBlocks[bi]
        result.push({ kind: 'block', block, pageIdx: pgIdx, key: `${block.id}::p${pgIdx}::i${bi}` })
      }
    }
    return result
  }, [blockData])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      const item = items[index]
      if (item?.kind === 'block') {
        const t = item.block.type
        if (t === 'image' || t === 'chart' || t === 'seal') return 400
        if (t === 'table') return 300
        if (t === 'equation') return 120
        if (t === 'code') return 200
        return 140
      }
      return 60
    },
    overscan: 8,
  })

  useEffect(() => {
    if (!activeBlockId || activeBlockSource === 'markdown') return
    const idx = items.findIndex((item) => item.kind === 'block' && item.block.id === activeBlockId)
    if (idx >= 0) {
      programmaticScrollRef.current = true
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'auto' })
      setTimeout(() => { programmaticScrollRef.current = false }, 300)
    }
  }, [activeBlockId, activeBlockSource, items, virtualizer])

  /** 滚动时检测当前页 (rAF 节流, 程序滚动时跳过) */
  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      const container = containerRef.current
      if (!container) return
      const scrollTop = container.scrollTop
      const virtualItems = virtualizer.getVirtualItems()
      if (virtualItems.length === 0) return
      // 找到最顶部可见的 item
      let topItem = virtualItems[0]
      for (const vi of virtualItems) {
        if (vi.start <= scrollTop + 20) topItem = vi
        else break
      }
      const item = items[topItem.index]
      if (!item) return
      const page = item.kind === 'separator' ? item.pageIdx + 1 : item.pageIdx + 1
      setCurrentPage(page, 'markdown')
    })
  }, [items, virtualizer, setCurrentPage])

  const handleClick = useCallback((block: BlockData) => { setActiveBlockId(activeBlockId === block.id ? null : block.id, 'markdown') }, [activeBlockId, setActiveBlockId])

  const handleDoubleClick = useCallback((block: BlockData) => {
    const newEditInfo = { id: block.block_position || '', type: block.type, content: block.text || '', blockId: block.id }
    const current = editInfoRef.current
    if (current && current.id === newEditInfo.id && current.type === newEditInfo.type) return
    setEditInfo(newEditInfo)
  }, [setEditInfo])

  /** 右键菜单: 弹出"翻译"选项（有选中文本则翻译选中，否则翻译整块） */
  const handleContextMenu = useCallback((e: React.MouseEvent, block: BlockData) => {
    e.preventDefault()
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    const text = selectedText || block.text || ''
    if (!text) return
    setContextMenu({ x: e.clientX, y: e.clientY, blockId: block.id, selectedText: text })
  }, [])

  /** 点击"翻译"菜单项 */
  const handleTranslateMenuClick = useCallback(async () => {
    if (!contextMenu) return
    const { blockId, selectedText } = contextMenu
    setContextMenu(null)
    if (!(await translateService.isConfigured())) {
      Toast.warning('请先在设置中配置翻译引擎')
      return
    }
    translateSelection(blockId, selectedText)
  }, [contextMenu, translateSelection])

  /** 关闭菜单 (点击外部/Escape) */
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  if (!blockData || blockData.length === 0 || items.length === 0) return <p className="text-sm text-gray-400">暂无块数据</p>

  return (
    <div ref={containerRef} className="block-markdown-view" style={{ height: '100%', overflow: 'auto', contain: 'strict' }} onScroll={handleScroll}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = items[vItem.index]
          if (!item) return null
          if (item.kind === 'separator') {
            return (
              <div key={item.key} ref={virtualizer.measureElement} data-index={vItem.index}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}>
                <div className="block-page-separator">第 {item.pageIdx + 1} 页</div>
              </div>
            )
          }
          const { block } = item
          return (
            <div key={item.key} ref={virtualizer.measureElement} data-index={vItem.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}>
              <BlockItem block={block} pageIdx={item.pageIdx} theme={theme} imageBasePath={imageBasePath}
                isActive={block.id === activeBlockId} isEditing={editInfo?.blockId === block.id}
                isEdited={!!(block.block_position && editedBlocks[block.block_position])}
                onBlockClick={handleClick} onBlockDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu} />
            </div>
          )
        })}
      </div>
      {/* 右键翻译菜单 */}
      {contextMenu && (
        <div
          className="translate-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 0,
            minWidth: 120,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="translate-context-menu-item"
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 13,
              color: '#333',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            onClick={handleTranslateMenuClick}
          >
            翻译
          </button>
        </div>
      )}
    </div>
  )
}
