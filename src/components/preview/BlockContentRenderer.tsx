import { memo } from 'react'
import type { BlockData } from '@/shared/types'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'
import { MarkdownRenderer, LazyImage } from '@/components/preview/MarkdownRenderer'

interface BlockContentRendererProps {
  block: BlockData
  theme: MarkdownTheme
  imageBasePath?: string
  hideCopyButton?: boolean
}

function sanitizeTableHtml(html: string): string {
  return html.replace(/\s*style\s*=\s*"[^"]*display\s*:\s*none[^"]*"/gi, '')
}

/**
 * 将文本中的字面转义序列（如 \n, \t, \\ 等）转换为实际字符，
 * 并将实际换行符转为 Markdown 可见的 `<br>` 标记。
 *
 * 分两步：
 *  1. 字面转义解义（\\n → 实际换行符等）
 *  2. 所有实际换行符 → <br>（配合 rehype-raw 渲染）
 *
 * ReactMarkdown + remarkGfm 默认将单换行视为空格而非 <br>，
 * 而 block_list.json 中的文本数据须保留原始换行排版。
 */
function unescapeText(text: string): string {
  return text
    .replace(/\\\\/g, '\\')       // 1) \\ → \   （必须最先处理）
    .replace(/\\n/g, '\n')        // 2) 字面 \n → 实际换行符
    .replace(/\\t/g, '\t')        // 3) \t → 制表符
    .replace(/\\r/g, '\r')        // 4) \r → 回车
    .replace(/\n/g, '<br>\n')     // 5) 所有实际换行 → <br>（含步骤 2 新产生的）
}

function normalizeImgPath(path: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('file://')) return path
  // HTTP(S) URL 原样透传，由 LazyImage 中的 fetch + blob URL 逻辑处理后端拉取
  if (/^https?:\/\//i.test(path)) return path
  // Unix 绝对路径（/home/...、/usr/...、/Users/... 等）原样透传
  if (/^\/(?:home|usr|var|tmp|opt|Users|etc|mnt|media|root)\//.test(path)) return path
  const clean = path.startsWith('/') ? path.slice(1) : path
  if (!clean || clean === '/') return path
  if (clean.includes('/') || clean.includes('\\')) return clean
  return `images/${clean}`
}

function RenderText({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (!block.text) return <span className="text-gray-400 italic">[empty: {block.type}]</span>
  return <MarkdownRenderer content={unescapeText(block.text)} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
}

function RenderTitle({ block }: BlockContentRendererProps) {
  const level = Math.min(Math.max(block.text_level ?? 3, 1), 4)
  const cls = `block-title-h${level}`
  const text = unescapeText(block.text || '')
  switch (level) {
    case 1: return <h1 className={cls}>{text}</h1>
    case 2: return <h2 className={cls}>{text}</h2>
    case 3: return <h3 className={cls}>{text}</h3>
    default: return <h4 className={cls}>{text}</h4>
  }
}

function RenderImage({ block, imageBasePath }: BlockContentRendererProps) {
  if (!block.img_path) return null
  const caption = block.img_caption ? unescapeText(block.img_caption) : (block.text ? unescapeText(block.text) : '')
  return (
    <figure className="block-figure">
      <LazyImage src={normalizeImgPath(block.img_path)} alt={caption} imageBasePath={imageBasePath} />
      {caption && <figcaption className="block-figcaption">{caption}</figcaption>}
      {block.img_footnote && <small className="block-figfootnote">{block.img_footnote}</small>}
    </figure>
  )
}

function RenderChart({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (block.img_path) {
    // 修复 chart 无法预览：img_path 现在从 chart_body 子块提取并回填到父块
    // chart_caption 子块的文本同样回填到 img_caption，优先使用 img_caption 作为图注
    const caption = block.img_caption ? unescapeText(block.img_caption) : (block.text ? unescapeText(block.text) : '')
    return (
      <figure className="block-figure">
        <LazyImage src={normalizeImgPath(block.img_path)} alt={caption || 'chart'} imageBasePath={imageBasePath} />
        {caption && <figcaption className="block-figcaption">{caption}</figcaption>}
      </figure>
    )
  }
  if (!block.text) return <span className="text-gray-400 italic">[empty: chart]</span>
  return <MarkdownRenderer content={unescapeText(block.text)} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
}

function RenderTable({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (!block.table_body && !block.text) return <span className="text-gray-400 italic">[empty: table]</span>
  return (
    <div className="block-table">
      {block.table_body ? (
        <div className="table-container" dangerouslySetInnerHTML={{ __html: sanitizeTableHtml(block.table_body) }} />
      ) : (
        <MarkdownRenderer content={unescapeText(block.text)} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
      )}
      {block.table_caption && <figcaption className="block-figcaption">{unescapeText(block.table_caption)}</figcaption>}
      {block.table_footnote && <small className="block-figfootnote">{block.table_footnote}</small>}
    </div>
  )
}

function RenderEquation({ block, theme }: BlockContentRendererProps) {
  const latex = block.latex || block.text
  if (!latex) return <span className="text-gray-400 italic">[空公式]</span>
  return <MarkdownRenderer content={`$$\n${unescapeText(latex)}\n$$`} theme={theme} hideCopyButton />
}

function RenderCode({ block, theme }: BlockContentRendererProps) {
  if (!block.text) return <span className="text-gray-400 italic">[empty: code]</span>
  return <MarkdownRenderer content={`\`\`\`text\n${unescapeText(block.text)}\n\`\`\``} theme={theme} hideCopyButton />
}

function RenderCaption({ block }: BlockContentRendererProps) {
  if (!block.text) return null
  return <figure className="block-caption-figure"><figcaption className="block-figcaption">{unescapeText(block.text)}</figcaption></figure>
}

export const BlockContentRenderer = memo(function BlockContentRenderer(props: BlockContentRendererProps) {
  const { block } = props
  switch (block.type) {
    case 'text': case 'ref_text': case 'algorithm': return <RenderText {...props} />
    case 'title': return <RenderTitle {...props} />
    case 'image': case 'seal': return <RenderImage {...props} />
    case 'chart': return <RenderChart {...props} />
    case 'table': return <RenderTable {...props} />
    case 'equation': return <RenderEquation {...props} />
    case 'code': return <RenderCode {...props} />
    case 'image_caption': case 'image_footnote': case 'table_caption': case 'table_footnote':
    case 'chart_caption': case 'code_caption': return <RenderCaption {...props} />
    case 'table_body': return <RenderTable {...props} />
    case 'interline_equation': return <RenderEquation {...props} />
    case 'header': case 'footer': case 'page_number': case 'aside_text': case 'page_footnote': return null
    default:
      if (block.text) return <RenderText {...props} />
      return <span className="text-gray-400 italic">[unknown: {block.type}]</span>
  }
})
