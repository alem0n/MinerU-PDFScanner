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
import { readTextFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
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
  // 网络 URL 与 data URI 直接返回——迁移方案要求"网络URL必须能正确显示"
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) return src
  // Tauri 已转换的 asset 协议直接返回
  if (src.startsWith('asset://') || src.startsWith('tauri://')) return src
  // http://asset.localhost/... — Tauri 2.x convertFileSrc 生成的 URL，直接返回
  if (/^https?:\/\/asset\.localhost\//i.test(src)) return src
  // file:// URL — 提取本地路径后通过 Tauri convertFileSrc 转为 webview 可加载的 URL
  // 迁移方案要求"绝对路径必须能正确显示"；源项目使用 file:// 协议，Tauri 需要转换
  if (src.startsWith('file://')) {
    const filePath = src.replace(/^file:\/\/(localhost\/)?\/?/i, '')
    return convertFileSrc(decodeURIComponent(filePath))
  }
  const normalizedSrc = src.replace(/\\/g, '/')
  // Windows 绝对路径（C:\... 或 C:/...）
  if (/^[a-zA-Z]:[\\/]/.test(normalizedSrc)) {
    return convertFileSrc(normalizedSrc)
  }
  // Unix 绝对路径（/...）
  if (normalizedSrc.startsWith('/')) {
    return convertFileSrc(normalizedSrc)
  }
  // 相对路径——拼接 imageBasePath 后转换，迁移方案要求"本地相对路径必须能正确显示"
  if (imageBasePath) {
    const base = imageBasePath.replace(/\\/g, '/').replace(/\/+$/, '')
    return convertFileSrc(`${base}/${normalizedSrc}`)
  }
  // imageBasePath 为空时无法解析相对路径，返回原始 src 并记录警告
  logger.warn(`resolveImageUrl: imageBasePath is empty, cannot resolve relative path "${src}"`)
  return src
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [text])
  return (
    <button onClick={handleCopy} className="copy-btn" title="复制">
      {copied ? '已复制' : '复制'}
    </button>
  )
}

/**
 * 从 HTTP URL 中提取末尾文件名，供本地文件 fallback 使用。
 * e.g. "http://localhost:8080/images/abc.jpg" → "abc.jpg"
 */
function extractFilenameFromUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr)
    const segments = url.pathname.split('/').filter(Boolean)
    return segments.pop() || null
  } catch {
    return null
  }
}

/**
 * rehype 插件：遍历 HAST 树，将所有 <img> 节点的 src 通过 resolveImageUrl 转换。
 * 在 rehypeRaw 之后运行，确保 raw HTML 中的 <img> 标签也被处理，
 * 防止 raw HTML img 绕过 components.img 组件覆盖。
 */
function rehypeImgResolver(imageBasePath?: string) {
  return function transformer(tree: any) {
    function walk(node: any) {
      if (node.type === 'element' && node.tagName === 'img' && node.properties?.src) {
        const originalSrc = String(node.properties.src)
        node.properties.src = resolveImageUrl(originalSrc, imageBasePath)
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}

export function LazyImage(props: React.ImgHTMLAttributes<HTMLImageElement> & { imageBasePath?: string }) {
  const { src, alt, imageBasePath, ...rest } = props
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const imgRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const blobUrlRef = useRef<string | null>(null)
  const resolveIdRef = useRef(0)

  // IntersectionObserver 懒加载
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

  // 清理 blob URL
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  // 解析图片源：当进入视口时触发
  useEffect(() => {
    if (!inView || !src) return
    const srcStr = src

    const currentId = ++resolveIdRef.current
    setLoading(true)
    setError(false)
    setImgSrc(null)

    async function resolve() {
      // 情况 A0：Tauri asset 协议 URL（http://asset.localhost/...）→ 直接加载，无需 fetch
      if (/^https?:\/\/asset\.localhost\//i.test(srcStr)) {
        if (currentId === resolveIdRef.current) {
          setImgSrc(srcStr)
          setLoading(false)
        }
        return
      }

      // 情况 A：HTTP(S) URL → 通过 fetch 从后端拉取 → blob URL
      if (/^https?:\/\//i.test(srcStr)) {
        try {
          const response = await fetch(srcStr, { mode: 'cors' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          const objectUrl = URL.createObjectURL(blob)
          // 清理旧 blob URL
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = objectUrl
          if (currentId === resolveIdRef.current) {
            setImgSrc(objectUrl)
            setLoading(false)
          }
          return
        } catch (err) {
          logger.warn(`LazyImage HTTP fetch failed: src="${srcStr}", error=${err instanceof Error ? err.message : String(err)}`)
          // HTTP 拉取失败 → 尝试本地文件 fallback
          // 从 URL 中提取文件名，应用与 normalizeImgPath 一致的 images/ 前缀约定
          const filename = extractFilenameFromUrl(srcStr)
          if (filename && imageBasePath) {
            const localName = filename.includes('/') || filename.includes('\\')
              ? filename
              : `images/${filename}`
            const localUrl = resolveImageUrl(localName, imageBasePath)
            if (currentId === resolveIdRef.current) {
              setImgSrc(localUrl)
              setLoading(false)
            }
            return
          }
        }
        // HTTP 与本地均失败
        if (currentId === resolveIdRef.current) {
          setError(true)
          setLoading(false)
        }
        return
      }

      // 情况 B：本地路径 → 直接通过 convertFileSrc 解析
      const resolved = resolveImageUrl(srcStr, imageBasePath)
      if (currentId === resolveIdRef.current) {
        setImgSrc(resolved)
        setLoading(false)
      }
    }

    resolve()
  }, [src, imageBasePath, inView])

  if (error) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded" style={{ minHeight: 120 }}>
        <span className="text-sm text-gray-400">图片加载失败</span>
      </div>
    )
  }

  if (loading || !imgSrc) {
    return (
      <div ref={imgRef} className="flex items-center justify-center bg-gray-100 rounded" style={{ minHeight: 120 }}>
        <span className="text-sm text-gray-400">加载中...</span>
      </div>
    )
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={() => {
        logger.error(`LazyImage load failed: src="${imgSrc}", alt="${alt || ''}"`)
        setError(true)
      }}
      /* 迁移方案要求"支持自适应容器"——maxWidth:100% 限制不超出容器，height:auto 保持宽高比 */
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
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
      logger.info(`Loading markdown from outputPath`)
      setLoading(true)
      try {
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
                /* 迁移方案 5.3 — rehype-raw 允许 raw HTML（表格等），rehype-katex 渲染 LaTeX 公式
                   KaTeX 选项：strict:false 容忍非标准 LaTeX 命令；throwOnError:false 避免不支持的公式导致渲染崩溃
                   确保"行内与块级公式必须正确转换为可读格式" */
                rehypePlugins={[[rehypeRaw, { pass: ['raw'] }], [rehypeImgResolver, imageBasePath], [rehypeKatex, { strict: false, throwOnError: false }]]}
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
