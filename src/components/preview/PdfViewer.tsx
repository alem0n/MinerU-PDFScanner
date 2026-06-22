import { useEffect, useState, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { TaskData, BlockData, MergeConnection } from '@/shared/types'
import { BlockOverlay } from '@/components/preview/BlockOverlay'
import { MergeOverlay } from '@/components/preview/MergeOverlay'
import { useEditorStore } from '@/stores/editorStore'
import { findPdfFile } from '@/service/preview.service'
import { readFile } from '@tauri-apps/plugin-fs'
import { createLogger } from '@/utils/logger'

const logger = createLogger('PdfViewer')

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
logger.info('PDF.js worker initialized via URL')

const PAGE_GAP = 8
const PAGE_BUFFER = 3
const INITIAL_PAGE_INFO_COUNT = 5
const DEFAULT_PAGE_WIDTH = 612
const DEFAULT_PAGE_HEIGHT = 792

const ZOOM_MIN = 0.1
const ZOOM_MAX = 2.0
const ZOOM_FACTOR = 1.25

interface PdfViewerProps {
  task: TaskData
  type: string
  blockData: BlockData[][] | null
  showOverlay: boolean
  onToggleShowLayout?: () => void
  mergeConnections?: MergeConnection[]
  outputPath?: string
  pdfUrl?: string
}

interface PageInfo {
  width: number
  height: number
}

export function PdfPanel({ task, type, blockData, showOverlay, onToggleShowLayout, mergeConnections, outputPath: outputPathProp, pdfUrl }: PdfViewerProps) {
  const outputPath = outputPathProp || task.unzip_file_output_path
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewportPage, setViewportPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [scale, setScale] = useState(ZOOM_MIN)
  const [pdfPath, setPdfPath] = useState<string>('')
  const fitScaleRef = useRef<number>(ZOOM_MIN)

  const containerRef = useRef<HTMLDivElement>(null)
  const pageDivRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const [pageInfos, setPageInfos] = useState<Map<number, PageInfo>>(new Map())
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set())
  const renderQueue = useRef<Set<string>>(new Set())
  const pageInfoLoadingRef = useRef<Set<number>>(new Set())
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const rafRef = useRef<number>(0)
  const activeBlockId = useEditorStore((s) => s.activeBlockId)
  const activeBlockSource = useEditorStore((s) => s.activeBlockSource)
  const setActiveBlockId = useEditorStore((s) => s.setActiveBlockId)
  const [pageInputValue, setPageInputValue] = useState<string>('')
  const [pageInputError, setPageInputError] = useState(false)

  useEffect(() => {
    if (!activeBlockId || !blockData) return
    if (activeBlockSource === 'pdf') return
    for (let pg = 0; pg < blockData.length; pg++) {
      const found = blockData[pg].find((b) => b.id === activeBlockId)
      if (found) {
        logger.info(`Sync PDF → page ${pg + 1} for activeBlockId="${activeBlockId}"`)
        jumpToPage(pg + 1)
        break
      }
    }
  }, [activeBlockId, blockData])

  useEffect(() => {
    if (pdfUrl) {
      logger.info(`Using provided PDF URL: "${pdfUrl}"`)
      setPdfPath(pdfUrl)
      return
    }
    if (!outputPath) {
      logger.warn('No output path, cannot find PDF')
      setLoading(false)
      setError('缺少输出路径')
      return
    }

    let cancelled = false
    async function findPdf() {
      const result = await findPdfFile(outputPath!)
      if (cancelled) return
      if (result) {
        logger.info(`Found PDF: "${result.path}"`)
        setPdfPath(result.path)
      } else {
        logger.warn(`No PDF found in output path "${outputPath}"`)
        setError('未找到 PDF 文件')
        setLoading(false)
      }
    }
    findPdf()
    return () => { cancelled = true }
  }, [outputPath, pdfUrl])

  useEffect(() => {
    if (!pdfPath) return
    let cancelled = false

    async function loadPdf() {
      logger.info(`Loading PDF from: "${pdfPath}"`)
      setLoading(true)
      setError(null)
      try {
        // 本地文件系统路径 → 使用 Tauri FS API 读取二进制数据
        // HTTP/HTTPS 远程 URL → 使用 fetch 加载
        const isRemote = /^https?:\/\//.test(pdfPath)
        let source: { url: string } | { data: Uint8Array }
        if (isRemote) {
          source = { url: pdfPath }
        } else {
          source = { data: await readFile(pdfPath) }
        }
        const loadingTask = pdfjsLib.getDocument(source)
        const doc = await loadingTask.promise
        if (cancelled) return

        logger.info(`PDF loaded: ${doc.numPages} pages from "${pdfPath}"`)
        setPdfDoc(doc)
        setTotalPages(doc.numPages)
        setLoading(false)

        const infos = new Map<number, PageInfo>()
        const initialCount = Math.min(INITIAL_PAGE_INFO_COUNT, doc.numPages)
        for (let i = 1; i <= initialCount; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          infos.set(i, { width: vp.width, height: vp.height })
        }
        if (!cancelled) {
          const container = containerRef.current
          let initScale = ZOOM_MIN
          if (container) {
            const firstInfo = infos.get(1)
            if (firstInfo) {
              initScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, container.clientWidth / firstInfo.width))
            }
          }
          fitScaleRef.current = initScale
          setScale(initScale)
          renderedAtScale.current = initScale
          logger.info(`Adaptive initial zoom: ${Math.round(initScale * 100)}%`)

          setPageInfos(infos)
          const init = new Set<number>()
          for (let i = 1; i <= Math.min(PAGE_BUFFER + 2, doc.numPages); i++) init.add(i)
          setRenderedPages(init)
        }
      } catch (err: any) {
        if (!cancelled) {
          logger.error(`PDF load failed: "${pdfPath}"`, err?.message || err)
          setError(`PDF 加载失败: ${err?.message || '未知错误'}`)
          setLoading(false)
        }
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [pdfPath])

  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const container = containerRef.current
      if (!container || pageInfos.size === 0) return

      const { scrollTop, clientHeight } = container
      const s = scaleRef.current
      const bufferH = clientHeight * 1.5

      let top = 0
      let visibleStart = 1
      let visibleEnd = 1
      let foundViewportPage = 1

      for (let i = 1; i <= totalPages; i++) {
        const info = pageInfos.get(i)
        const ch = info ? info.height * s : DEFAULT_PAGE_HEIGHT * s
        const pageTop = top
        const pageBottom = top + ch

        if (pageBottom >= scrollTop - bufferH && pageTop <= scrollTop + clientHeight + bufferH) {
          if (visibleStart === 1 && i > 1) visibleStart = i
          visibleEnd = i
        }

        if (!foundViewportPage || pageTop <= scrollTop + clientHeight * 0.3) {
          foundViewportPage = i
        }

        top += ch + PAGE_GAP
      }

      visibleStart = Math.max(1, visibleStart - PAGE_BUFFER)
      visibleEnd = Math.min(totalPages, visibleEnd + PAGE_BUFFER)

      setRenderedPages(prev => {
        const next = new Set(prev)
        let changed = false
        for (let i = visibleStart; i <= visibleEnd; i++) {
          if (!next.has(i)) { next.add(i); changed = true }
        }
        return changed ? next : prev
      })

      if (foundViewportPage !== viewportPage) {
        setViewportPage(foundViewportPage)
      }
    })
  }, [pageInfos, totalPages, viewportPage])

  useEffect(() => {
    handleScroll()
  }, [scale, handleScroll])

  useEffect(() => {
    if (!pdfDoc || renderedPages.size === 0) return

    const missingPages: number[] = []
    for (const pg of renderedPages) {
      if (!pageInfos.has(pg) && !pageInfoLoadingRef.current.has(pg)) {
        missingPages.push(pg)
      }
    }
    if (missingPages.length === 0) return

    let cancelled = false

    async function loadPageInfos() {
      for (const pg of missingPages) {
        if (cancelled) return
        pageInfoLoadingRef.current.add(pg)
        try {
          const page = await pdfDoc!.getPage(pg)
          const vp = page.getViewport({ scale: 1 })
          if (!cancelled) {
            setPageInfos((prev) => {
              if (prev.has(pg)) return prev
              const next = new Map(prev)
              next.set(pg, { width: vp.width, height: vp.height })
              return next
            })
          }
        } catch (err) {
          logger.error(`Lazy page info load failed: pg=${pg}`, err)
        } finally {
          pageInfoLoadingRef.current.delete(pg)
        }
      }
    }

    loadPageInfos()
    return () => { cancelled = true }
  }, [pdfDoc, renderedPages, pageInfos])

  const renderedAtScale = useRef<number>(0)

  useEffect(() => {
    if (!pdfDoc || renderedPages.size === 0) return

    const currentScale = scaleRef.current
    const scaleChanged = currentScale !== renderedAtScale.current
    if (scaleChanged) renderedAtScale.current = currentScale

    let cancelled = false

    async function renderPages() {
      for (const pageNum of renderedPages) {
        if (cancelled) return
        const key = `pg${pageNum}s${currentScale}`
        if (renderQueue.current.has(key)) continue
        renderQueue.current.add(key)
        try {
          const canvas = canvasRefs.current.get(pageNum)
          if (!canvas) continue

          const page = await pdfDoc!.getPage(pageNum)
          const viewport = page.getViewport({ scale: currentScale })
          if (cancelled) { renderQueue.current.delete(key); return }

          if (!scaleChanged && canvas.width === viewport.width && canvas.height === viewport.height) {
            renderQueue.current.delete(key)
            continue
          }

          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          logger.debug(`Page ${pageNum} rendered at ${Math.round(currentScale * 100)}%`)
        } catch (err) {
          logger.error(`Render page ${pageNum} error:`, err)
        } finally {
          renderQueue.current.delete(key)
        }
      }
    }

    renderPages()
    return () => { cancelled = true }
  }, [pdfDoc, renderedPages, scale])

  useEffect(() => {
    setPageInputValue(String(viewportPage))
    setPageInputError(false)
  }, [viewportPage])

  const handleBlockClick = useCallback((block: BlockData) => {
    const nextId = block.id === activeBlockId ? null : block.id
    logger.info(`Block click: id="${block.id}", type="${block.type}", active=${nextId ? 'yes' : 'no'}`)
    setActiveBlockId(nextId, 'pdf')
  }, [activeBlockId, setActiveBlockId])

  const jumpToPage = useCallback((page: number) => {
    const el = pageDivRefs.current.get(page)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setViewportPage(page)
    }
  }, [])

  const handlePrevPage = useCallback(() => {
    jumpToPage(Math.max(viewportPage - 1, 1))
  }, [viewportPage, jumpToPage])

  const handleNextPage = useCallback(() => {
    jumpToPage(Math.min(viewportPage + 1, totalPages))
  }, [viewportPage, totalPages, jumpToPage])

  const zoomStep = useCallback((s: number, direction: 1 | -1) => {
    const z = direction === 1
      ? Math.min(s * ZOOM_FACTOR, ZOOM_MAX)
      : Math.max(s / ZOOM_FACTOR, ZOOM_MIN)
    logger.debug(`${direction === 1 ? 'Zoom in' : 'Zoom out'}: ${Math.round(s * 100)}% → ${Math.round(z * 100)}%`)
    return z
  }, [])

  const handleZoomIn = useCallback(() => {
    setScale(s => zoomStep(s, 1))
  }, [zoomStep])

  const handleZoomOut = useCallback(() => {
    setScale(s => zoomStep(s, -1))
  }, [zoomStep])

  const handleZoomReset = useCallback(() => {
    logger.debug(`Zoom reset to ${Math.round(fitScaleRef.current * 100)}%`)
    setScale(fitScaleRef.current)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '+') handleZoomIn()
    if (e.key === '-') handleZoomOut()
    if (e.key === '0') handleZoomReset()
    if (e.key === 'ArrowLeft') handlePrevPage()
    if (e.key === 'ArrowRight') handleNextPage()
  }, [handleZoomIn, handleZoomOut, handleZoomReset, handlePrevPage, handleNextPage])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    if (e.deltaY < 0) {
      setScale(s => zoomStep(s, 1))
    } else if (e.deltaY > 0) {
      setScale(s => zoomStep(s, -1))
    }
  }, [zoomStep])

  if (type === 'office') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
          <span className="font-medium">Office 预览</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          <p>Office 文档预览 (可通过 OnlyOffice 扩展)</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="flex items-center justify-between px-3 h-10 border-b bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.88)' }}>PDF 预览</span>
        </div>

        {!loading && !error && (
          <div className="flex-1 flex justify-center">
            <div className="btn-group">
              <button onClick={handlePrevPage} disabled={viewportPage <= 1}
                className="btn btn-icon btn-sm" title="上一页">◀</button>
              <input
                type="text"
                inputMode="numeric"
                value={pageInputValue}
                onChange={e => {
                  const raw = e.target.value
                  const digits = raw.replace(/\D/g, '')
                  setPageInputValue(digits)
                  if (pageInputError) setPageInputError(false)
                }}
                onBlur={() => {
                  const v = parseInt(pageInputValue, 10)
                  if (!isNaN(v) && v >= 1 && v <= totalPages) {
                    jumpToPage(v)
                  } else {
                    setPageInputError(true)
                    setPageInputValue(String(viewportPage))
                    setTimeout(() => setPageInputError(false), 1500)
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur()
                  }
                }}
                className={`btn btn-sm${pageInputError ? ' border-red-500 ring-2 ring-red-300' : ''}`}
                style={{ width: 48, textAlign: 'center', margin: 0 }}
              />
              <span className="btn btn-icon btn-sm" style={{ cursor: 'default', pointerEvents: 'none' }}>/</span>
              <span className="btn btn-icon btn-sm" style={{ width: 32, cursor: 'default', pointerEvents: 'none' }}>{totalPages}</span>
              <button onClick={handleNextPage} disabled={viewportPage >= totalPages}
                className="btn btn-icon btn-sm" title="下一页">▶</button>
            </div>
          </div>
        )}

        <div className="btn-group">
          <button onClick={handleZoomOut} className="btn btn-icon btn-sm" title="缩小">−</button>
          <button onClick={handleZoomReset} className="btn btn-sm" style={{ width: 48, textAlign: 'center' }}
            title="重置">{Math.round(scale * 100)}%</button>
          <button onClick={handleZoomIn} className="btn btn-icon btn-sm" title="放大">+</button>
          {onToggleShowLayout && (
            <button onClick={onToggleShowLayout}
              className={`btn btn-icon btn-sm${showOverlay ? ' btn-primary' : ''}`}
              title={showOverlay ? '隐藏文本解析框' : '显示文本解析框'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="12" y2="16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-200"
        onScroll={handleScroll} onWheel={handleWheel}>
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <p className="mt-2 text-sm text-gray-500">加载 PDF...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-sm text-gray-500">
              <p className="text-gray-700 mb-1">PDF 加载失败</p>
              <p className="text-xs">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && pageInfos.size > 0 && (
          <div className="flex flex-col items-center py-2" style={{ gap: PAGE_GAP, position: 'relative' }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => {
              const info = pageInfos.get(pg)
              const pw = info ? info.width : DEFAULT_PAGE_WIDTH
              const ph = info ? info.height : DEFAULT_PAGE_HEIGHT
              const w = Math.round(pw * scale)
              const h = Math.round(w * (ph / pw))
              const isRendered = renderedPages.has(pg)

              return (
                <div key={pg}
                  ref={el => { if (el) pageDivRefs.current.set(pg, el); else pageDivRefs.current.delete(pg) }}
                  data-page={pg}
                  className="relative flex-shrink-0"
                  style={{ width: w, height: h, contain: 'content' }}>
                  {isRendered ? (
                    <>
                      <canvas
                        ref={el => { if (el) canvasRefs.current.set(pg, el); else canvasRefs.current.delete(pg) }}
                        className="shadow-lg bg-white"
                        style={{ width: w, height: h }}
                      />
                      {blockData && blockData[pg - 1] && (
                          <BlockOverlay
                            blocks={blockData[pg - 1]}
                            pageSize={[pw, ph]}
                            canvasSize={[w, h]}
                            activeBlockId={activeBlockId ?? undefined}
                            onBlockClick={handleBlockClick}
                            dimmed={!showOverlay}
                        />
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-white shadow-lg flex items-center justify-center">
                      <div className="text-gray-300 text-sm">第 {pg} 页</div>
                    </div>
                  )}
                </div>
              )
            })}
            <MergeOverlay
              connections={mergeConnections}
              pdfData={blockData}
              pageInfos={pageInfos}
              scale={scale}
              totalPages={totalPages}
            />
          </div>
        )}
      </div>
    </div>
  )
}
