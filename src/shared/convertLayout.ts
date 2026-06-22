/**
 * layout.json → block_list.json 数据转换逻辑（唯一来源）
 * 同时被主进程和渲染进程引用，不依赖任何平台 API
 */
import type { BlockData, BlockListData, MergeConnection } from './types'

// ── 内部类型 ──

interface LayoutSpan {
  bbox: number[]
  type: string
  content: string
  score: number
  // image_body / chart_body 的 span 携带 image_path（图片相对路径）
  // table_body 的 span 携带 html（表格 HTML 源码）与 image_path（表格截图）
  // 修复 table/chart 无法预览：这些字段必须从 span 中提取
  image_path?: string
  html?: string
}

interface LayoutLine {
  bbox: number[]
  spans: LayoutSpan[]
}

interface LayoutBlock {
  bbox: number[]
  type: string
  angle: number
  index: number
  level?: number
  lines: LayoutLine[]
  blocks?: LayoutBlock[]
  latex?: string
  img_path?: string
  img_caption?: string
  img_footnote?: string
  table_body?: string
  table_caption?: string
  table_footnote?: string
}

export interface LayoutPage {
  page_size: [number, number]
  page_idx: number
  para_blocks: LayoutBlock[]
  discarded_blocks: LayoutBlock[]
}

// ── 类型映射 ──

const TYPE_MAP: Record<string, string> = {
  title:              'title',
  text:               'text',
  image:              'image',
  table:              'table',
  header:             'header',
  footer:             'footer',
  page_number:        'page_number',
  ref_text:           'ref_text',
  aside_text:         'aside_text',
  interline_equation: 'equation',
  code:               'code',
  code_caption:       'code_caption',
  chart:              'chart',
  chart_caption:      'chart_caption',
  // 修复 chart 无法预览：chart_body 子块需映射为 chart，使 BlockContentRenderer 能按 chart 类型渲染
  chart_body:         'chart',
  seal:               'seal',
  image_body:         'image',
  image_caption:      'image_caption',
  image_footnote:     'image_footnote',
  table_body:         'table',
  table_caption:      'table_caption',
  table_footnote:     'table_footnote',
  algorithm:          'algorithm',
  paragraph:          'text',
  paragraph_title:    'title',
  page_footnote:      'page_footnote',
}

const HEADER_INDEX = -99999
const FOOTER_INDEX = -999999
const OTHER_DISCARDED_INDEX = -999999

// ── 颜色方案 ──

const BLOCK_COLORS: Record<string, { line: string; fill: string }> = {
  title:              { line: 'rgba(13, 83, 222, 1)',    fill: 'rgba(13, 83, 222, 0.12)' },
  text:               { line: 'rgba(100, 116, 139, 1)',  fill: 'rgba(100, 116, 139, 0.08)' },
  image:              { line: 'rgba(168, 85, 247, 1)',   fill: 'rgba(168, 85, 247, 0.12)' },
  table:              { line: 'rgba(34, 197, 94, 1)',    fill: 'rgba(34, 197, 94, 0.10)' },
  table_body:         { line: 'rgba(34, 197, 94, 1)',    fill: 'rgba(34, 197, 94, 0.10)' },
  header:             { line: 'rgba(209, 213, 219, 1)',  fill: 'rgba(209, 213, 219, 0.06)' },
  footer:             { line: 'rgba(209, 213, 219, 1)',  fill: 'rgba(209, 213, 219, 0.06)' },
  page_number:        { line: 'rgba(209, 213, 219, 1)',  fill: 'rgba(209, 213, 219, 0.04)' },
  aside_text:         { line: 'rgba(251, 191, 36, 1)',   fill: 'rgba(251, 191, 36, 0.10)' },
  ref_text:           { line: 'rgba(156, 163, 175, 1)',  fill: 'rgba(156, 163, 175, 0.06)' },
  page_footnote:      { line: 'rgba(209, 213, 219, 1)',  fill: 'rgba(209, 213, 219, 0.04)' },
  equation:           { line: 'rgba(251, 146, 60, 1)',   fill: 'rgba(251, 146, 60, 0.12)' },
  interline_equation: { line: 'rgba(251, 146, 60, 1)',   fill: 'rgba(251, 146, 60, 0.12)' },
  code:               { line: 'rgba(45, 212, 191, 1)',   fill: 'rgba(45, 212, 191, 0.10)' },
  code_caption:       { line: 'rgba(45, 212, 191, 1)',   fill: 'rgba(45, 212, 191, 0.06)' },
  algorithm:          { line: 'rgba(45, 212, 191, 1)',   fill: 'rgba(45, 212, 191, 0.10)' },
  chart:              { line: 'rgba(236, 72, 153, 1)',   fill: 'rgba(236, 72, 153, 0.10)' },
  chart_caption:      { line: 'rgba(236, 72, 153, 1)',   fill: 'rgba(236, 72, 153, 0.06)' },
  seal:               { line: 'rgba(239, 68, 68, 1)',    fill: 'rgba(239, 68, 68, 0.10)' },
  image_caption:      { line: 'rgba(168, 85, 247, 1)',   fill: 'rgba(168, 85, 247, 0.06)' },
  image_footnote:     { line: 'rgba(168, 85, 247, 1)',   fill: 'rgba(168, 85, 247, 0.06)' },
  table_caption:      { line: 'rgba(34, 197, 94, 1)',    fill: 'rgba(34, 197, 94, 0.06)' },
  table_footnote:     { line: 'rgba(34, 197, 94, 1)',    fill: 'rgba(34, 197, 94, 0.06)' },
}

// ── 工具函数 ──

export function getBlockColor(type: string): { line: string; fill: string } {
  return BLOCK_COLORS[type] || BLOCK_COLORS.text
}

function flattenText(lines: LayoutLine[]): string {
  if (!lines || lines.length === 0) return ''
  const texts: string[] = []
  for (const line of lines) {
    if (!line.spans || line.spans.length === 0) continue
    texts.push(line.spans.map((s) => s.content || '').join(''))
  }
  return texts.join('\n')
}

// 修复 table/chart/image 无法预览：
// image_body / chart_body 块的图片路径存储在 span.image_path，
// table_body 块的 HTML 源码存储在 span.html。
// 这些字段不在父块上，必须从 lines → spans 中提取。
function extractSpanField(lines: LayoutLine[], field: 'image_path' | 'html'): string | undefined {
  if (!lines || lines.length === 0) return undefined
  for (const line of lines) {
    if (!line.spans || line.spans.length === 0) continue
    for (const span of line.spans) {
      const v = (span as any)[field]
      if (v && typeof v === 'string' && v.length > 0) return v
    }
  }
  return undefined
}

function getDiscardedIndex(type: string): number {
  if (type === 'header') return HEADER_INDEX
  if (type === 'footer') return FOOTER_INDEX
  return OTHER_DISCARDED_INDEX
}

// ── 单个 block 转换 ──

function convertSingleBlock(
  block: LayoutBlock,
  pageIdx: number,
  pageSize: number[],
  isDiscarded: boolean,
): BlockData {
  const mappedType = TYPE_MAP[block.type] || block.type
  const text = flattenText(block.lines || [])

  // 修复 table/chart/image 无法预览：
  // 优先使用 block 自身的 img_path / table_body 字段（部分数据源直接放在父块上）；
  // 若缺失，则从 lines → spans 中提取（image_body/chart_body 的 image_path，table_body 的 html）。
  const imgPathFromSpans = extractSpanField(block.lines || [], 'image_path')
  const tableHtmlFromSpans = extractSpanField(block.lines || [], 'html')

  return {
    id: crypto.randomUUID(),
    type: mappedType,
    text,
    text_level: block.level ?? 1,
    bbox: block.bbox,
    page_num: pageIdx + 1,
    block_index: isDiscarded ? getDiscardedIndex(block.type) : block.index,
    content: text,
    page_idx: pageIdx,
    page_size: pageSize,
    block_position: '', // assigned later after sorting
    is_discarded: isDiscarded,
    angle: block.angle ?? 0,
    color: getBlockColor(mappedType),
    level: block.level,
    img_path: block.img_path || imgPathFromSpans,
    img_caption: block.img_caption,
    img_footnote: block.img_footnote,
    table_body: block.table_body || tableHtmlFromSpans,
    table_caption: block.table_caption,
    table_footnote: block.table_footnote,
    latex: block.latex,
  }
}

// ── 单页 block 转换（含子块） ──

function convertBlocksForPage(
  blocks: LayoutBlock[],
  pageIdx: number,
  pageSize: number[],
  isDiscarded: boolean,
): BlockData[] {
  const result: BlockData[] = []

  for (const block of blocks) {
    const mainBlock = convertSingleBlock(block, pageIdx, pageSize, isDiscarded)
    result.push(mainBlock)

    if (block.blocks && block.blocks.length > 0) {
      mainBlock.is_container = true
      // 先收集子块转换结果，便于后续将子块数据向上回填到父块
      const convertedSubs: BlockData[] = []
      for (const subBlock of block.blocks) {
        const converted = convertSingleBlock(subBlock, pageIdx, pageSize, isDiscarded)
        converted.parent_id = mainBlock.id
        // 旧逻辑：父块字段向下兜底（保留以兼容数据直接放在父块上的情况）
        if (block.type === 'image') {
          converted.img_path = converted.img_path || block.img_path
          converted.img_caption = converted.img_caption || block.img_caption
          converted.img_footnote = converted.img_footnote || block.img_footnote
        }
        if (block.type === 'table') {
          converted.table_body = converted.table_body || block.table_body
          converted.table_caption = converted.table_caption || block.table_caption
          converted.table_footnote = converted.table_footnote || block.table_footnote
        }
        convertedSubs.push(converted)
        result.push(converted)
      }

      // 修复 table/chart/image 无法预览：
      // 当父块本身缺少 img_path / table_body 时，从子块（image_body/chart_body/table_body）
      // 提取的数据向上回填到父块，使父块在 BlockContentRenderer 中能正确渲染图片与表格。
      if (block.type === 'image' || block.type === 'chart') {
        if (!mainBlock.img_path) {
          const subWithImg = convertedSubs.find((s) => s.img_path)
          if (subWithImg) mainBlock.img_path = subWithImg.img_path
        }
        if (!mainBlock.img_caption) {
          const capSub = convertedSubs.find((s) => s.type === 'image_caption' || s.type === 'chart_caption')
          if (capSub && capSub.text) mainBlock.img_caption = capSub.text
        }
      }
      if (block.type === 'table') {
        if (!mainBlock.table_body) {
          const subWithBody = convertedSubs.find((s) => s.table_body)
          if (subWithBody) mainBlock.table_body = subWithBody.table_body
        }
        if (!mainBlock.table_caption) {
          const capSub = convertedSubs.find((s) => s.type === 'table_caption')
          if (capSub && capSub.text) mainBlock.table_caption = capSub.text
        }
        if (!mainBlock.table_footnote) {
          const fnSub = convertedSubs.find((s) => s.type === 'table_footnote')
          if (fnSub && fnSub.text) mainBlock.table_footnote = fnSub.text
        }
      }
    }
  }

  return result
}

// ── 丢弃块合并（同区域同类型合并为一个块） ──

function mergeDiscardedBlocks(pageBlocks: BlockData[]): BlockData[] {
  const discarded = pageBlocks.filter((b) => b.is_discarded && b.bbox)
  const regular = pageBlocks.filter((b) => !b.is_discarded || !b.bbox)

  if (discarded.length <= 1) return pageBlocks

  const groups = new Map<string, BlockData[]>()
  for (const block of discarded) {
    const bbox = block.bbox!
    const cy = (bbox[1] + bbox[3]) / 2
    const pageH = block.page_size?.[1] || 1000
    let region: string
    if (cy < pageH / 3) region = 'top'
    else if (cy > pageH * 2 / 3) region = 'bottom'
    else region = 'mid'
    const key = `${region}_${block.type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(block)
  }

  const merged: BlockData[] = []
  for (const [, group] of groups) {
    if (group.length <= 1) {
      merged.push(...group)
      continue
    }
    const first = group[0]
    const unionBbox = [...first.bbox!]
    const texts: string[] = []
    if (first.text) texts.push(first.text)
    for (let i = 1; i < group.length; i++) {
      const b = group[i].bbox!
      unionBbox[0] = Math.min(unionBbox[0], b[0])
      unionBbox[1] = Math.min(unionBbox[1], b[1])
      unionBbox[2] = Math.max(unionBbox[2], b[2])
      unionBbox[3] = Math.max(unionBbox[3], b[3])
      if (group[i].text) texts.push(group[i].text)
    }

    merged.push({
      ...first,
      id: crypto.randomUUID(),
      bbox: unionBbox,
      text: texts.join(' | '),
      content: texts.join(' | '),
    })
  }

  return [...regular, ...merged]
}

// ── 排序 & 分配位置 ──

function sortAndAssignPositions(blocks: BlockData[], pageIdx: number): void {
  blocks.sort((a, b) => a.block_index - b.block_index)

  blocks.forEach((block, i) => {
    block.block_position = `${pageIdx}-${i}`
  })

  let blockIndex = 0
  for (const block of blocks) {
    block.block_index = blockIndex++
  }
}

// ── Merge Connections（链式合并） ──

function findNextBlock(current: BlockData, pageMap: Map<number, Map<number, BlockData>>): BlockData | undefined {
  const page = current.page_num - 1
  const nextIndex = current.block_index + 1

  // Try same page, next index
  let next = pageMap.get(page)?.get(nextIndex)
  if (next) return next

  // Try next page, index 0
  for (let p = page + 1; p < pageMap.size; p++) {
    const pageBlocks = pageMap.get(p)
    if (!pageBlocks || pageBlocks.size === 0) continue
    const minIndex = Math.min(...pageBlocks.keys())
    const firstBlock = pageBlocks.get(minIndex)
    if (firstBlock) return firstBlock
    break
  }

  return undefined
}

function findPrevBlock(current: BlockData, pageMap: Map<number, Map<number, BlockData>>): BlockData | undefined {
  const page = current.page_num - 1
  const prevIndex = current.block_index - 1

  if (prevIndex >= 0) {
    let prev = pageMap.get(page)?.get(prevIndex)
    if (prev) return prev
  }

  // Try previous page, last index
  for (let p = page - 1; p >= 0; p--) {
    const pageBlocks = pageMap.get(p)
    if (!pageBlocks || pageBlocks.size === 0) continue
    const maxIndex = Math.max(...pageBlocks.keys())
    const lastBlock = pageBlocks.get(maxIndex)
    if (lastBlock) return lastBlock
    break
  }

  return undefined
}

export function buildMergeConnections(pdfData: BlockData[][]): MergeConnection[] {
  if (!pdfData || pdfData.length === 0) return []

  const allBlocks: BlockData[] = []
  for (const pageBlocks of pdfData) {
    for (const block of pageBlocks) {
      allBlocks.push(block)
    }
  }

  const mergeBlocks = allBlocks.filter((b) => b.merge_prev || b.merge_next)
  if (mergeBlocks.length === 0) return []

  // Sort by page_num, then block_index
  allBlocks.sort((a, b) => {
    if (a.page_num !== b.page_num) return a.page_num - b.page_num
    return a.block_index - b.block_index
  })

  // Build lookup: page -> Map<index, BlockData>
  const pageMap = new Map<number, Map<number, BlockData>>()
  for (const block of allBlocks) {
    const page = block.page_num - 1
    if (!pageMap.has(page)) pageMap.set(page, new Map())
    pageMap.get(page)!.set(block.block_index, block)
  }

  const visited = new Set<string>()
  const chains: BlockData[][] = []

  for (const block of mergeBlocks) {
    if (visited.has(block.id)) continue

    const chain: BlockData[] = []

    // Walk backward to find start of chain
    let current: BlockData | undefined = block
    while (current && current.merge_prev) {
      chain.unshift(current)
      visited.add(current.id)
      current = findPrevBlock(current, pageMap)
      if (current && visited.has(current.id)) break
    }
    if (current && !visited.has(current.id)) {
      chain.unshift(current)
      visited.add(current.id)
    }

    // Walk forward from block
    current = block.merge_next ? findNextBlock(block, pageMap) : undefined
    while (current && !visited.has(current.id)) {
      chain.push(current)
      visited.add(current.id)
      if (current.merge_next) {
        current = findNextBlock(current, pageMap)
      } else {
        current = undefined
      }
    }

    if (chain.length >= 2) chains.push(chain)
  }

  return chains.map((chain, idx) => ({
    id: `merge-${idx}`,
    blocks: chain.map((b) => b.block_position || `${b.page_num - 1}_${b.block_index}`),
    type: 'merge' as const,
  }))
}

// ── 对外主转换函数（同步） ──

/**
 * 将 layout.json 中的 pdf_info 数组转换为 block_list.json 格式
 */
export function convertLayoutToBlocks(pdfInfo: LayoutPage[]): BlockListData {
  if (!pdfInfo || pdfInfo.length === 0) {
    return { pdfData: [], mergeConnections: [] }
  }

  const pdfData: BlockData[][] = []

  for (const page of pdfInfo) {
    const pageBlocks: BlockData[] = []

    const regularBlocks = convertBlocksForPage(page.para_blocks || [], page.page_idx, page.page_size, false)
    pageBlocks.push(...regularBlocks)

    const discardedBlocks = convertBlocksForPage(page.discarded_blocks || [], page.page_idx, page.page_size, true)
    pageBlocks.push(...discardedBlocks)

    const merged = mergeDiscardedBlocks(pageBlocks)
    sortAndAssignPositions(merged, page.page_idx)
    pdfData.push(merged)
  }

  return { pdfData, mergeConnections: buildMergeConnections(pdfData) }
}

// ── 对外主转换函数（异步，适合渲染进程避免卡顿） ──

const PAGE_CHUNK_SIZE = 5

export async function convertLayoutToBlocksAsync(pdfInfo: LayoutPage[]): Promise<BlockListData> {
  if (!pdfInfo || pdfInfo.length === 0) {
    return { pdfData: [], mergeConnections: [] }
  }

  const pdfData: BlockData[][] = []

  for (let pi = 0; pi < pdfInfo.length; pi++) {
    const page = pdfInfo[pi]
    const pageBlocks: BlockData[] = []

    const regularBlocks = convertBlocksForPage(page.para_blocks || [], page.page_idx, page.page_size, false)
    pageBlocks.push(...regularBlocks)

    const discardedBlocks = convertBlocksForPage(page.discarded_blocks || [], page.page_idx, page.page_size, true)
    pageBlocks.push(...discardedBlocks)

    const merged = mergeDiscardedBlocks(pageBlocks)
    sortAndAssignPositions(merged, page.page_idx)
    pdfData.push(merged)

    if (pi > 0 && pi % PAGE_CHUNK_SIZE === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return { pdfData, mergeConnections: buildMergeConnections(pdfData) }
}
