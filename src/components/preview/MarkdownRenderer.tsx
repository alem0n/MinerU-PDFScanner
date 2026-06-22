import { useEffect, useState, useCallback, useRef, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { convertFileSrc } from '@tauri-apps/api/core'
import { createLogger } from '@/utils/logger'
import type { Components } from 'react-markdown'

type MarkdownTheme = 'base' | 'dark' | 'light'

const logger = createLogger('MarkdownRenderer')

export interface MarkdownRendererProps {
  outputPath?: string
  content?: string
  theme?: MarkdownTheme
  imageBasePath?: string
  hideCopyButton?: boolean
}

export function resolveImageUrl(src: string, imageBasePath?: string): string {
  if (!src) return src
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) return src
  if (src.startsWith('asset://') || src.startsWith('tauri://')) return src
  const normalizedSrc = src.replace(/\\/g, '/')
  if (/^[a-zA-Z]:[\\/]/.test(normalizedSrc)) {
    return convertFileSrc(normalizedSrc)
  }
  if (normalizedSrc.startsWith('/')) {
    return convertFileSrc(normalizedSrc)
  }
  if (imageBasePath) {
    const base = imageBasePath.replace(/\\/g, '/').replace(/\/+$/, '')
    return convertFileSrc(`${base}/${normalizedSrc}`)
  }
  return convertFileSrc(normalizedSrc)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // ignore
      }
    }
  }, [text])
  return (
    <button onClick={handleCopy} className="copy-btn" title="复制">
      {copied ? '已复制' : '复制'}
    </button>
  )
}

export function LazyImage(props: React.ImgHTMLAttributes<HTMLImageElement> & { imageBasePath?: string }) {
  const { src, alt, imageBasePath, ...rest } = props
  const [error, setError] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const resolvedSrc = resolveImageUrl(src || '', imageBasePath)

  if (error) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded" style={{ minHeight: 120 }}>
        <span className="text-sm text-gray-400">图片加载失败</span>
      </div>
    )
  }

  if (!inView) {
    return (
      <div ref={imgRef} className="flex items-center justify-center bg-gray-100 rounded" style={{ minHeight: 120 }}>
        <span className="text-sm text-gray-400">加载中...</span>
      </div>
    )
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      onError={() => setError(true)}
      style={{ maxWidth: '100%', borderRadius: 4 }}
      {...rest}
    />
  )
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ outputPath, content: externalContent, theme = 'base', imageBasePath, hideCopyButton }: MarkdownRendererProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(externalContent !== undefined)

  useEffect(() => {
    if (externalContent !== undefined) return
    let cancelled = false
    async function load() {
      if (!outputPath) {
        setLoading(false)
        setContent('')
        return
      }
      logger.info(`Loading markdown from: "${outputPath}/full.md"`)
      setLoading(true)
      try {
        const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
        const { join } = await import('@tauri-apps/api/path')
        const mdPath = await join(outputPath, 'full.md')
        const fileExists = await exists(mdPath)
        if (fileExists) {
          const text = await readTextFile(mdPath)
          if (!cancelled) {
            logger.info(`Markdown loaded: ${text.length} chars`)
            setContent(text)
          }
        } else {
          logger.warn(`full.md not found at "${mdPath}"`)
          if (!cancelled) setContent('')
        }
      } catch (err) {
        logger.warn(`Failed to fetch full.md:`, err)
        if (!cancelled) setContent('')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [outputPath, externalContent])

  useEffect(() => {
    if (externalContent !== undefined) {
      setVisible(true)
      return
    }
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [externalContent])

  const mdContent = externalContent !== undefined ? externalContent : content

  const handleCopyFullMarkdown = useCallback(async () => {
    if (!mdContent) return
    try {
      await navigator.clipboard.writeText(mdContent)
    } catch {
      // ignore
    }
  }, [mdContent])

  const syntaxTheme = theme === 'dark' ? oneDark : oneLight

  const components: Components = {
    img({ src, alt, ...props }) {
      return <LazyImage src={src} alt={alt} imageBasePath={imageBasePath} {...props} />
    },
    table({ children, ...props }) {
      return (
        <div className="table-container">
          <table {...props}>{children}</table>
        </div>
      )
    },
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const codeString = String(children).replace(/\n$/, '')
      if (match) {
        return (
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span className="lang-label">{match[1]}</span>
              <CopyButton text={codeString} />
            </div>
            <SyntaxHighlighter
              style={syntaxTheme}
              language={match[1]}
              PreTag="div"
              customStyle={{ margin: 0, borderRadius: '0 0 6px 6px' }}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        )
      }
      return <code className={className} {...props}>{children}</code>
    },
  }

  const themeClass = theme === 'dark' ? 'markdown-body markdown-theme-dark' : 'markdown-body'

  return (
    <div ref={containerRef} className="markdown-render-container relative">
      {externalContent === undefined && loading ? (
        <p className="text-sm text-gray-400">加载中...</p>
      ) : externalContent !== undefined && !mdContent ? null : !mdContent ? (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          {outputPath ? '未找到 full.md 文件' : '缺少输出路径'}
        </div>
      ) : (
        <>
          {!hideCopyButton && (
            <button
              onClick={handleCopyFullMarkdown}
              className="absolute top-0 right-0 p-1 text-xs text-gray-400 hover:text-gray-600 rounded z-10"
              title="复制全文 Markdown"
            >
              复制
            </button>
          )}
          <div className={themeClass}>
            {visible ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                components={components}
              >
                {mdContent}
              </ReactMarkdown>
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: 200 }}>
                <span className="text-sm text-gray-400">滚动以加载...</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
})
