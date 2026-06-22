import { useMemo, useState, useCallback } from 'react'
import type { BlockData } from '@/shared/types'
import { getBlockColor } from '@/utils/blockColor'
import { createLogger } from '@/utils/logger'

const logger = createLogger('BlockOverlay')

const PRIMARY = '#1677ff'
const PRIMARY_BG = 'rgba(22, 119, 255, 0.10)'

interface BlockOverlayProps {
  blocks: BlockData[]
  pageSize: [number, number]
  canvasSize: [number, number]
  activeBlockId?: string
  onBlockClick?: (block: BlockData) => void
  onBlockHover?: (block: BlockData | null) => void
  dimmed?: boolean
}

export function BlockOverlay({
  blocks, pageSize, canvasSize, activeBlockId, onBlockClick, onBlockHover, dimmed,
}: BlockOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const visibleBlocks = useMemo(() => {
    return blocks.filter((b) => b.bbox && b.bbox.length === 4)
  }, [blocks])

  const containerChildren = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const block of blocks) {
      if (block.parent_id) {
        if (!map.has(block.parent_id)) map.set(block.parent_id, new Set())
        map.get(block.parent_id)!.add(block.id)
      }
    }
    return map
  }, [blocks])

  const handleMouseEnter = useCallback((block: BlockData) => {
    setHoveredId(block.id)
    onBlockHover?.(block)
  }, [onBlockHover])

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null)
    onBlockHover?.(null)
  }, [onBlockHover])

  if (visibleBlocks.length === 0) return null

  logger.debug(`Rendering ${visibleBlocks.length} overlays, active="${activeBlockId || '(none)'}"`)

  const [pageW, pageH] = pageSize
  const [containerW, containerH] = canvasSize

  return (
    <div className="block-overlay-container"
      style={{ position: 'absolute', top: 0, left: 0, width: containerW, height: containerH, pointerEvents: 'none' }}>
      <svg viewBox={`0 0 ${pageW} ${pageH}`} width={containerW} height={containerH}
        preserveAspectRatio="none">
        {visibleBlocks.map((block) => {
          const b = block.bbox!
          const x = b[0], y = b[1], w = b[2] - b[0], h = b[3] - b[1]
          if (w <= 0 || h <= 0) return null

          const isActive = block.id === activeBlockId
          const isHovered = block.id === hoveredId
          const isContainer = block.is_container === true
          const isRotated = block.angle === 90
          const isDiscarded = block.is_discarded
          const typeColor = getBlockColor(block.type)
          const cx = x + w / 2, cy = y + h / 2

          const childIds = isContainer ? containerChildren.get(block.id) : undefined
          const childHovered = childIds?.has(hoveredId ?? '') ?? false
          const childActive = childIds?.has(activeBlockId ?? '') ?? false
          const containerLit = isContainer && (isHovered || isActive || childHovered || childActive)
          const isDimmed = dimmed && !isActive && !isHovered && !childActive && !childHovered

          const stroke = isActive || childActive ? PRIMARY
            : containerLit ? typeColor.line
            : isDimmed ? 'transparent'
            : typeColor.line

          const fill = isActive || childActive ? PRIMARY_BG
            : containerLit ? typeColor.fill
            : isContainer ? 'transparent'
            : isDimmed ? 'transparent'
            : typeColor.fill

          const strokeW = isActive || childActive ? 2
            : containerLit ? 1.5
            : isContainer ? 0.75
            : 1

          const dashArray = isContainer ? '4 4' : (isDiscarded ? '4 4' : undefined)
          const showLabel = (isActive || isHovered) && !isContainer
            || (childHovered || childActive)

          const groupTransform = isRotated ? `rotate(${block.angle}, ${cx}, ${cy})` : undefined

          return (
            <g key={block.id}
              className={`block-group${isActive ? ' active' : ''}${isDiscarded ? ' discarded' : ''}${isContainer ? ' container' : ''}`}
              data-type={block.type}
              data-block-position={block.block_position || ''}
              transform={groupTransform}
              onClick={(e) => { e.stopPropagation(); onBlockClick?.(block) }}
              onMouseEnter={() => handleMouseEnter(block)}
              onMouseLeave={handleMouseLeave}>

              <rect x={x} y={y} width={w} height={h} rx={6} ry={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeW}
                strokeDasharray={dashArray}
                className="koharu-block-rect"
              />

              {showLabel && (
                <foreignObject x={x - 2} y={y - 18} width={200} height={16}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0 5px',
                    fontSize: '9px',
                    fontWeight: 600,
                    lineHeight: '14px',
                    color: '#fff',
                    background: typeColor.line,
                    borderRadius: '3px',
                    whiteSpace: 'nowrap',
                  }}>
                    {block.type}
                  </span>
                </foreignObject>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
