import { useMemo, useRef } from 'react'
import type { BlockData, MergeConnection } from '@/shared/types'
import { getBlockColor } from '@/utils/blockColor'
import { findOptimalPath, type Rect, type Point } from '@/utils/pathPlanning'
import { createLogger } from '@/utils/logger'

const logger = createLogger('MergeOverlay')

const PAGE_GAP = 8

interface PageInfo {
  width: number
  height: number
}

interface MergePath {
  id: string
  path: Point[]
  color: string
}

interface MergeOverlayProps {
  connections: MergeConnection[] | undefined
  pdfData: BlockData[][] | null
  pageInfos: Map<number, PageInfo>
  scale: number
  totalPages: number
}

function computeChecksum(
  pdfData: BlockData[][] | null,
  connections: MergeConnection[] | undefined,
  pageInfos: Map<number, PageInfo>,
  scale: number,
  totalPages: number,
): string {
  const parts: string[] = []
  parts.push(`s:${scale.toFixed(4)}`)
  parts.push(`tp:${totalPages}`)
  parts.push(`pi:${pageInfos.size}`)

  if (connections && connections.length > 0) {
    for (const c of connections) {
      parts.push(`c:${c.id}:${c.blocks.join(',')}`)
    }
  }

  if (pdfData) {
    let bcount = 0
    for (const page of pdfData) {
      bcount += page.length
    }
    parts.push(`bc:${bcount}`)
    const sampleInterval = Math.max(1, Math.floor(bcount / 20))
    let idx = 0
    for (const page of pdfData) {
      for (const block of page) {
        if (idx % sampleInterval === 0) {
          parts.push(`b:${block.id}:${block.bbox?.join(',') || ''}`)
        }
        idx++
      }
    }
  }

  return parts.join('|')
}

export function MergeOverlay({ connections, pdfData, pageInfos, scale, totalPages }: MergeOverlayProps) {
  const cacheRef = useRef<{ checksum: string; paths: MergePath[] }>({ checksum: '', paths: [] })

  const paths = useMemo(() => {
    if (!pdfData || !pageInfos || pageInfos.size === 0) return []

    const conns = connections && connections.length > 0 ? connections : []
    if (conns.length === 0) return []

    const checksum = computeChecksum(pdfData, connections, pageInfos, scale, totalPages)
    if (checksum === cacheRef.current.checksum) {
      return cacheRef.current.paths
    }

    const normPos = (p: string): string => p.replace(/_/g, '-')
    const blockMap = new Map<string, { block: BlockData; pageIdx: number }>()
    for (let pi = 0; pi < pdfData.length; pi++) {
      for (const block of pdfData[pi]) {
        const pos = block.block_position || ''
        const entry = { block, pageIdx: pi }
        if (pos) {
          blockMap.set(pos, entry)
          blockMap.set(normPos(pos), entry)
          if (pos.includes('-')) blockMap.set(pos.replace(/-/g, '_'), entry)
          if (pos.includes('_')) blockMap.set(pos.replace(/_/g, '-'), entry)
        }
        blockMap.set(block.id, entry)
      }
    }

    const gapUnit = PAGE_GAP / scale
    const pageStartsY: number[] = []
    let vy = gapUnit
    for (let i = 1; i <= totalPages; i++) {
      pageStartsY.push(vy)
      const info = pageInfos.get(i)
      vy += (info ? info.height : 792) + gapUnit
    }

    const results: MergePath[] = []

    const allObstacles: Rect[] = []
    for (let pi = 0; pi < pdfData.length; pi++) {
      const pageY = pageStartsY[pi] ?? 0
      for (const block of pdfData[pi]) {
        if (!block.bbox || block.bbox.length < 4) continue
        const [x1, y1, x2, y2] = block.bbox
        if (x2 <= x1 || y2 <= y1) continue
        allObstacles.push({ x1, y1: y1 + pageY, x2, y2: y2 + pageY })
      }
    }

    for (const conn of conns) {
      if (conn.blocks.length < 2) continue

      const blockRects: { rect: Rect; color: string }[] = []
      for (const pos of conn.blocks) {
        const entry = blockMap.get(pos) || blockMap.get(normPos(pos))
          || blockMap.get(pos.replace(/_/g, '-')) || blockMap.get(pos.replace(/-/g, '_'))
        if (!entry) continue
        const b = entry.block
        if (!b.bbox || b.bbox.length < 4) continue
        const [x1, y1, x2, y2] = b.bbox
        if (x2 <= x1 || y2 <= y1) continue
        const pageY = pageStartsY[entry.pageIdx] ?? 0
        blockRects.push({
          rect: { x1, y1: y1 + pageY, x2, y2: y2 + pageY },
          color: getBlockColor(b.type).line,
        })
      }

      if (blockRects.length < 2) continue
      const color = blockRects[0].color

      for (let i = 0; i < blockRects.length - 1; i++) {
        const from = blockRects[i].rect
        const to = blockRects[i + 1].rect

        const obstacles = allObstacles.filter((r) => {
          if (r.x1 === from.x1 && r.y1 === from.y1 && r.x2 === from.x2 && r.y2 === from.y2) return false
          if (r.x1 === to.x1 && r.y1 === to.y1 && r.x2 === to.x2 && r.y2 === to.y2) return false
          return true
        })

        const path = findOptimalPath(from, to, obstacles)
        results.push({ id: `${conn.id}-${i}`, path, color })
      }
    }

    cacheRef.current = { checksum, paths: results }
    logger.info(`MergeOverlay: ${results.length} paths computed for ${conns.length} connections`)
    return results
  }, [connections, pdfData, pageInfos, scale, totalPages])

  if (paths.length === 0) return null

  const gapUnit = PAGE_GAP / scale
  const pw = pageInfos.size > 0 ? (pageInfos.get(1)?.width ?? 612) : 612
  let totalH = gapUnit
  for (let i = 1; i <= totalPages; i++) {
    const info = pageInfos.get(i)
    totalH += (info ? info.height : 792) + gapUnit
  }
  const svgW = Math.round(pw * scale)
  const svgH = Math.round(totalH * scale)

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: svgW,
      height: svgH,
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      <svg
        viewBox={`0 0 ${pw} ${totalH}`}
        width={svgW}
        height={svgH}
        preserveAspectRatio="none"
      >
        {paths.map((mp) => {
          const pts = mp.path.map((p) => `${p.x},${p.y}`).join(' ')
          const mid = Math.floor(mp.path.length / 2)
          const lp = mp.path[mid]
          return (
            <g key={mp.id} style={{ pointerEvents: 'none' }}>
              <circle cx={mp.path[0].x} cy={mp.path[0].y} r={4} fill={mp.color}
                className="merge-dot" />
              <polyline points={pts} fill="none" stroke={mp.color}
                strokeWidth={2} strokeDasharray="5,5"
                className="merge-connection-path" />
              <circle cx={mp.path[mp.path.length - 1].x} cy={mp.path[mp.path.length - 1].y}
                r={4} fill={mp.color} className="merge-dot" />
              {lp && (
                <g transform={`translate(${lp.x - 16}, ${lp.y - 9})`}>
                  <rect x={0} y={0} width={32} height={14} rx={7} fill={mp.color} />
                  <text x={16} y={7} fill="#fff" fontSize={9} fontWeight={600}
                    textAnchor="middle" dominantBaseline="central">合并</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
