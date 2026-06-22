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

function normalizeImgPath(path: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('file://')) return path
  const clean = path.startsWith('/') ? path.slice(1) : path
  if (!clean || clean === '/') return path
  if (clean.includes('/') || clean.includes('\\')) return clean
  return `images/${clean}`
}

function RenderText({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (!block.text) return <span className="text-gray-400 italic">[empty: {block.type}]</span>
  return <MarkdownRenderer content={block.text} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
}

function RenderTitle({ block }: BlockContentRendererProps) {
  const level = Math.min(Math.max(block.text_level ?? 3, 1), 4)
  const cls = `block-title-h${level}`
  switch (level) {
    case 1: return <h1 className={cls}>{block.text}</h1>
    case 2: return <h2 className={cls}>{block.text}</h2>
    case 3: return <h3 className={cls}>{block.text}</h3>
    default: return <h4 className={cls}>{block.text}</h4>
  }
}

function RenderImage({ block, imageBasePath }: BlockContentRendererProps) {
  if (!block.img_path) return null
  return (
    <figure className="block-figure">
      <LazyImage src={normalizeImgPath(block.img_path)} alt={block.img_caption || block.text || ''} imageBasePath={imageBasePath} />
      {(block.img_caption || block.text) && <figcaption className="block-figcaption">{block.img_caption || block.text}</figcaption>}
      {block.img_footnote && <small className="block-figfootnote">{block.img_footnote}</small>}
    </figure>
  )
}

function RenderChart({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (block.img_path) {
    return (
      <figure className="block-figure">
        <LazyImage src={normalizeImgPath(block.img_path)} alt="chart" imageBasePath={imageBasePath} />
        {block.text && <figcaption className="block-figcaption">{block.text}</figcaption>}
      </figure>
    )
  }
  if (!block.text) return <span className="text-gray-400 italic">[empty: chart]</span>
  return <MarkdownRenderer content={block.text} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
}

function RenderTable({ block, theme, imageBasePath, hideCopyButton }: BlockContentRendererProps) {
  if (!block.table_body && !block.text) return <span className="text-gray-400 italic">[empty: table]</span>
  return (
    <div className="block-table">
      {block.table_body ? (
        <div className="table-container" dangerouslySetInnerHTML={{ __html: sanitizeTableHtml(block.table_body) }} />
      ) : (
        <MarkdownRenderer content={block.text} theme={theme} imageBasePath={imageBasePath} hideCopyButton={hideCopyButton} />
      )}
      {block.table_caption && <figcaption className="block-figcaption">{block.table_caption}</figcaption>}
      {block.table_footnote && <small className="block-figfootnote">{block.table_footnote}</small>}
    </div>
  )
}

function RenderEquation({ block, theme }: BlockContentRendererProps) {
  const latex = block.latex || block.text
  if (!latex) return <span className="text-gray-400 italic">[空公式]</span>
  return <MarkdownRenderer content={`$$\n${latex}\n$$`} theme={theme} hideCopyButton />
}

function RenderCode({ block, theme }: BlockContentRendererProps) {
  if (!block.text) return <span className="text-gray-400 italic">[empty: code]</span>
  return <MarkdownRenderer content={`\`\`\`text\n${block.text}\n\`\`\``} theme={theme} hideCopyButton />
}

function RenderCaption({ block }: BlockContentRendererProps) {
  if (!block.text) return null
  return <figure className="block-caption-figure"><figcaption className="block-figcaption">{block.text}</figcaption></figure>
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
