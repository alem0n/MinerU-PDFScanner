import { useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BlockData } from '@/shared/types'
import { getBlockColor } from '@/utils/blockColor'
import { BlockContentRenderer } from '@/components/preview/BlockContentRenderer'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'
import { useEditorStore } from '@/stores/editorStore'

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
}

const BlockItem = memo(function BlockItem({ block, theme, imageBasePath, isActive, isEditing, isEdited, onBlockClick, onBlockDoubleClick }: BlockItemProps) {
  const color = getBlockColor(block.type)
  return (
    <div data-block-id={block.id}
      className={`md-block-box${isActive ? ' active' : ''}${isEditing ? ' annotation-box--editing' : ''}${block.is_discarded ? ' discarded' : ''}`}
      style={{ '--md-block-line': isActive ? '#1677ff' : color.line, '--md-block-fill': isActive ? 'rgba(22, 119, 255, 0.08)' : color.fill } as React.CSSProperties}
      onClick={() => onBlockClick(block)} onDoubleClick={() => onBlockDoubleClick(block)}>
      <span className="md-block-type-label">{block.type}</span>
      {isEdited && <span className="md-block-edited-tag">已编辑</span>}
      <div className="block-section-text prose-sm">
        {block.is_discarded && ['header','footer','page_number','aside_text','page_footnote'].includes(block.type)
          ? <span className="text-gray-300 italic text-xs">已丢弃 ({block.type})</span>
          : <BlockContentRenderer block={block} theme={theme} imageBasePath={imageBasePath} hideCopyButton />}
      </div>
    </div>
  )
})

export function MarkdownBlockView({ blockData, theme = 'base', imageBasePath }: MarkdownBlockViewProps) {
  const activeBlockId = useEditorStore((s) => s.activeBlockId)
  const activeBlockSource = useEditorStore((s) => s.activeBlockSource)
  const setActiveBlockId = useEditorStore((s) => s.setActiveBlockId)
  const editInfo = useEditorStore((s) => s.editInfo)
  const setEditInfo = useEditorStore((s) => s.setEditInfo)
  const editedBlocks = useEditorStore((s) => s.editedBlocks)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInfoRef = useRef(editInfo)
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
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'auto' })
  }, [activeBlockId, activeBlockSource, items, virtualizer])

  const handleClick = useCallback((block: BlockData) => { setActiveBlockId(activeBlockId === block.id ? null : block.id, 'markdown') }, [activeBlockId, setActiveBlockId])

  const handleDoubleClick = useCallback((block: BlockData) => {
    const newEditInfo = { id: block.block_position || '', type: block.type, content: block.text || '', blockId: block.id }
    const current = editInfoRef.current
    if (current && current.id === newEditInfo.id && current.type === newEditInfo.type) return
    setEditInfo(newEditInfo)
  }, [setEditInfo])

  if (!blockData || blockData.length === 0 || items.length === 0) return <p className="text-sm text-gray-400">暂无块数据</p>

  return (
    <div ref={containerRef} className="block-markdown-view" style={{ height: '100%', overflow: 'auto', contain: 'strict' }}>
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
                onBlockClick={handleClick} onBlockDoubleClick={handleDoubleClick} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
