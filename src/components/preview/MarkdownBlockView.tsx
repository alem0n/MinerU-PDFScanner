import { useEffect, useMemo, useRef, useCallback, useState, memo } from 'react'
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
  showTypeLabel?: boolean
}

type ListItem =
  | { kind: 'separator'; pageIdx: number; key: string }
  | { kind: 'block'; block: BlockData; pageIdx: number; key: string }

interface BlockItemProps {
  block: BlockData; pageIdx: number; theme: MarkdownTheme; imageBasePath?: string
  isActive: boolean; isEditing: boolean; isEdited: boolean
  onBlockClick: (block: BlockData) => void; onBlockDoubleClick: (block: BlockData) => void
  onContextMenu: (e: React.MouseEvent, block: BlockData) => void
  showTypeLabel?: boolean
}

const BlockItem = memo(function BlockItem({ block, theme, imageBasePath, isActive, isEditing, isEdited, onBlockClick, onBlockDoubleClick, onContextMenu, showTypeLabel = true }: BlockItemProps) {
  const color = getBlockColor(block.type)
  return (
    <div data-block-id={block.id}
      className={`md-block-box${isActive ? ' active' : ''}${isEditing ? ' annotation-box--editing' : ''}${block.is_discarded ? ' discarded' : ''}`}
      style={{ '--md-block-line': isActive ? '#1677ff' : color.line, '--md-block-fill': isActive ? 'rgba(22, 119, 255, 0.08)' : color.fill } as React.CSSProperties}
      onClick={() => onBlockClick(block)} onDoubleClick={() => onBlockDoubleClick(block)}
      onContextMenu={(e) => onContextMenu(e, block)}>
      {showTypeLabel && <span className="md-block-type-label">{block.type}</span>}
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

export function MarkdownBlockView({ blockData, theme = 'base', imageBasePath, showTypeLabel = true }: MarkdownBlockViewProps) {
  const activeBlockId = useEditorStore((s) => s.activeBlockId)
  const activeBlockSource = useEditorStore((s) => s.activeBlockSource)
  const setActiveBlockId = useEditorStore((s) => s.setActiveBlockId)
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage)
  const editInfo = useEditorStore((s) => s.editInfo)
  const setEditInfo = useEditorStore((s) => s.setEditInfo)
  const editedBlocks = useEditorStore((s) => s.editedBlocks)
  const { translateSelection, translateBlock } = useTranslate()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string; selectedText: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInfoRef = useRef(editInfo)
  const pageObserverRef = useRef<IntersectionObserver | null>(null)
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

  /** 滚动到 active 区块 (替代 virtualizer.scrollToIndex) */
  useEffect(() => {
    if (!activeBlockId || activeBlockSource === 'markdown') return
    const el = containerRef.current?.querySelector(`[data-block-id="${activeBlockId}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }, [activeBlockId, activeBlockSource])

  /** 当前页检测: IntersectionObserver 监听页面分隔线 (替代 virtualizer.getVirtualItems) */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    pageObserverRef.current?.disconnect()

    const separators = container.querySelectorAll<HTMLElement>('.block-page-separator')
    if (separators.length === 0) return

    pageObserverRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const pageIdx = Number(visible[0].target.getAttribute('data-page-idx'))
          if (!isNaN(pageIdx)) {
            setCurrentPage(pageIdx + 1, 'markdown')
          }
        }
      },
      { root: container, rootMargin: '-20px 0px -80% 0px' },
    )

    separators.forEach((el) => pageObserverRef.current?.observe(el))
    return () => pageObserverRef.current?.disconnect()
  }, [items, setCurrentPage])

  const handleScroll = useCallback(() => {
    // 页面检测交给 IntersectionObserver, 这里留空
  }, [])

  /** 点击区块: 选中文字时不切换 active (避免选中误触) */
  const handleClick = useCallback((block: BlockData) => {
    const sel = window.getSelection()
    if (sel && sel.toString().trim().length > 0) return
    setActiveBlockId(activeBlockId === block.id ? null : block.id, 'markdown')
  }, [activeBlockId, setActiveBlockId])

  const handleDoubleClick = useCallback((block: BlockData) => {
    const newEditInfo = { id: block.block_position || '', type: block.type, content: block.text || '', blockId: block.id }
    const current = editInfoRef.current
    if (current && current.id === newEditInfo.id && current.type === newEditInfo.type) return
    setEditInfo(newEditInfo)
  }, [setEditInfo])

  /** 右键菜单: 弹出"翻译"选项
   *  - 有选中文字: 选中翻译 → 浮动面板
   *  - 无选中: 翻译整块 → 原文下方 + 缓存 (全文翻译时跳过)
   */
  const handleContextMenu = useCallback((e: React.MouseEvent, block: BlockData) => {
    e.preventDefault()
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    if (!selectedText && !block.text) return
    setContextMenu({ x: e.clientX, y: e.clientY, blockId: block.id, selectedText })
  }, [])

  /** 点击"翻译"菜单项: 分流选中翻译 / 块翻译 */
  const handleTranslateMenuClick = useCallback(async () => {
    if (!contextMenu) return
    const { blockId, selectedText, x, y } = contextMenu
    setContextMenu(null)
    if (!(await translateService.isConfigured())) {
      Toast.warning('请先在设置中配置翻译引擎')
      return
    }
    if (selectedText) {
      // 选中翻译 → 浮动面板
      translateSelection(selectedText, x, y)
    } else {
      // 块翻译 → 原文下方 + blockTranslations 缓存 (全文翻译时自动跳过)
      const block = items.find((it): it is Extract<ListItem, { kind: 'block' }> => it.kind === 'block' && it.block.id === blockId)?.block
      if (block?.text) {
        translateBlock(blockId, block.text, block.block_position)
      }
    }
  }, [contextMenu, translateSelection, translateBlock, items])

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
    <div ref={containerRef} className="block-markdown-view" style={{ height: '100%', overflow: 'auto' }} onScroll={handleScroll}>
      {items.map((item) => {
        if (item.kind === 'separator') {
          return (
            <div key={item.key} className="block-page-separator" data-page-idx={item.pageIdx}>
              第 {item.pageIdx + 1} 页
            </div>
          )
        }
        const { block } = item
        return (
          <BlockItem key={item.key} block={block} pageIdx={item.pageIdx} theme={theme} imageBasePath={imageBasePath}
            isActive={block.id === activeBlockId} isEditing={editInfo?.blockId === block.id}
            isEdited={!!(block.block_position && editedBlocks[block.block_position])}
            onBlockClick={handleClick} onBlockDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu} showTypeLabel={showTypeLabel} />
        )
      })}
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
