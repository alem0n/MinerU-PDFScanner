/**
 * useTranslate — 翻译操作 Hook
 *
 * 封装右键选中翻译与全文翻译的调用逻辑, 连接 translateService 与 translateStore。
 * 步骤 6: 实现右键选中翻译 (translateSelection)
 * 步骤 7b: 扩展全文翻译窗口化 (startWindowTranslate / extendWindow)
 */
import { useCallback, useEffect, useRef } from 'react'
import { translateService } from '@/service/translate.service'
import {
  useTranslateStore,
  INITIAL_WINDOW,
  PREFETCH_BATCH,
  PREFETCH_EDGE,
} from '@/stores/translateStore'
import { useEditorStore } from '@/stores/editorStore'
import type { BlockData } from '@/shared/types'
import { TranslateError } from '@/translate'
import { createLogger } from '@/utils/logger'

const logger = createLogger('useTranslate')

/** 可翻译块类型判定 (与 BlockContentRenderer 的 type 分发对齐) */
const TRANSLATABLE_TYPES = new Set([
  'text', 'ref_text', 'algorithm', 'title',
  'image_caption', 'image_footnote',
  'table_caption', 'table_footnote',
  'chart_caption', 'code_caption',
])

/** 丢弃型 (渲染器 return null) */
const DISCARDED_TYPES = new Set([
  'header', 'footer', 'page_number', 'aside_text', 'page_footnote',
])

/** 判断块是否可翻译 */
export function isTranslatable(block: BlockData): boolean {
  if (DISCARDED_TYPES.has(block.type)) return false
  if (!TRANSLATABLE_TYPES.has(block.type)) return false
  if (block.is_discarded) return false
  const text = (block.text || '').trim()
  if (!text) return false
  return true
}

/** 判断文本是否可能需要翻译 (排除纯数字/纯符号/纯URL) */
export function isLikelyTranslatable(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length <= 1) return false
  // 纯数字
  if (/^[\d\s.,]+$/.test(trimmed)) return false
  // 纯标点符号
  if (/^[\p{P}\s]+$/u.test(trimmed)) return false
  // 纯 URL
  if (/^https?:\/\/\S+$/i.test(trimmed)) return false
  return true
}

/** 超长文本分段 */
export function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const segments: string[] = []
  // 优先按段落切
  const paragraphs = text.split(/\n\n+/)
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      segments.push(para)
    } else {
      // 按句子切
      const sentences = para.split(/(?<=[。.!?！？\n])/)
      let current = ''
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars) {
          if (current) segments.push(current)
          if (sentence.length > maxChars) {
            // 硬截断
            for (let i = 0; i < sentence.length; i += maxChars) {
              segments.push(sentence.slice(i, i + maxChars))
            }
            current = ''
          } else {
            current = sentence
          }
        } else {
          current += sentence
        }
      }
      if (current) segments.push(current)
    }
  }
  return segments
}

export function useTranslate() {
  const addSelectionResult = useTranslateStore((s) => s.addSelectionResult)
  const setSelectionStatus = useTranslateStore((s) => s.setSelectionStatus)
  const removeSelectionTranslation = useTranslateStore((s) => s.removeSelectionTranslation)
  const setBlockResult = useTranslateStore((s) => s.setBlockResult)
  const setBlockStatus = useTranslateStore((s) => s.setBlockStatus)
  const initBatch = useTranslateStore((s) => s.initBatch)
  const startBatch = useTranslateStore((s) => s.startBatch)
  const updateBatchProgress = useTranslateStore((s) => s.updateBatchProgress)
  const markPageTranslated = useTranslateStore((s) => s.markPageTranslated)
  const markPageTranslating = useTranslateStore((s) => s.markPageTranslating)
  const unmarkPageTranslating = useTranslateStore((s) => s.unmarkPageTranslating)
  const updateCoverageEdge = useTranslateStore((s) => s.updateCoverageEdge)
  const setBatchStatus = useTranslateStore((s) => s.setBatchStatus)
  const setSessionActive = useTranslateStore((s) => s.setSessionActive)
  const setAbortController = useTranslateStore((s) => s.setAbortController)
  const isExtendingRef = useRef(false)
  const jumpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 右键选中翻译 */
  const translateSelection = useCallback(
    async (blockId: string, selectedText: string) => {
      const text = selectedText.trim()
      if (!text) return

      addSelectionResult(blockId, { source: text, target: '', status: 'requesting' })
      const list = useTranslateStore.getState().selectionTranslations[blockId] || []
      const index = list.length - 1

      try {
        if (!(await translateService.isConfigured())) {
          throw new TranslateError('翻译引擎未配置, 请先在设置中配置', 'config')
        }
        const results = await translateService.translate([text])
        if (results.length > 0) {
          removeSelectionTranslation(blockId, index)
          useTranslateStore.getState().addSelectionResult(blockId, {
            source: text,
            target: results[0].text,
            status: 'done',
          })
        } else {
          setSelectionStatus(blockId, index, 'error', '未返回有效译文')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setSelectionStatus(blockId, index, 'cancelled')
          return
        }
        const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
        setSelectionStatus(blockId, index, 'error', msg)
        logger.warn(`translateSelection failed: ${msg}`)
      }
    },
    [addSelectionResult, setSelectionStatus, removeSelectionTranslation],
  )

  /** 翻译一个页范围 (内部核心) */
  const translatePageRange = useCallback(
    async (startPage: number, endPage: number, signal: AbortSignal) => {
      const layerData = useEditorStore.getState().layerData
      const blockTranslations = useTranslateStore.getState().blockTranslations
      const cfg = await translateService.getConfig()

      // 收集所有待翻译块 (跨页)
      const pageBlocks: Map<number, BlockData[]> = new Map()
      const allBlocks: BlockData[] = []
      for (let pg = startPage; pg <= endPage; pg++) {
        const blocks = layerData[pg - 1] || []
        markPageTranslating(pg)
        const translatable = blocks.filter((b) => isTranslatable(b) && isLikelyTranslatable(b.text))
        pageBlocks.set(pg, translatable)
        allBlocks.push(...translatable)
      }

      // 去重: 相同 text 只翻译一次
      const textToBlocks = new Map<string, BlockData[]>()
      for (const block of allBlocks) {
        // 缓存命中: 已有 done 译文且原文未变
        const existing = blockTranslations[block.id]
        if (existing && existing.status === 'done' && existing.source === block.text) {
          continue
        }
        const arr = textToBlocks.get(block.text)
        if (arr) arr.push(block)
        else textToBlocks.set(block.text, [block])
      }

      const uniqueTexts = Array.from(textToBlocks.keys())
      const totalTasks = uniqueTexts.length
      let done = 0
      let failed = 0

      startBatch(totalTasks)

      if (totalTasks === 0) {
        // 无可翻译块, 所有页直接标记完成
        for (let pg = startPage; pg <= endPage; pg++) {
          markPageTranslated(pg)
          updateCoverageEdge(pg)
        }
        return
      }

      // 并发翻译 (semaphore 在 service 层控制)
      const promises = uniqueTexts.map(async (text) => {
        if (signal.aborted) return
        const blocks = textToBlocks.get(text)!
        for (const b of blocks) {
          setBlockStatus(b.id, 'requesting')
        }
        try {
          // 超长分段
          if (text.length > cfg.maxChunkChars) {
            const segments = splitLongText(text, cfg.maxChunkChars)
            const segResults: string[] = []
            for (const seg of segments) {
              if (signal.aborted) return
              const r = await translateService.translate([seg], { signal })
              if (r.length > 0) segResults.push(r[0].text)
            }
            const combined = segResults.join('\n')
            done++
            for (const b of blocks) {
              setBlockResult(b.id, {
                blockPosition: b.block_position,
                source: text,
                target: combined,
                status: 'done',
              })
            }
          } else {
            const results = await translateService.translate([text], { signal })
            done++
            const target = results[0]?.text || ''
            for (const b of blocks) {
              setBlockResult(b.id, {
                blockPosition: b.block_position,
                source: text,
                target,
                status: 'done',
              })
            }
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          failed++
          const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
          for (const b of blocks) {
            setBlockStatus(b.id, 'error', msg)
          }
          logger.warn(`translateBlock failed: ${msg}`)
        } finally {
          updateBatchProgress(done, failed)
        }
      })

      await Promise.allSettled(promises)

      // 标记页完成
      for (let pg = startPage; pg <= endPage; pg++) {
        markPageTranslated(pg)
        updateCoverageEdge(pg)
      }
    },
    [startBatch, setBlockStatus, setBlockResult, updateBatchProgress, markPageTranslated, markPageTranslating, unmarkPageTranslating, updateCoverageEdge],
  )

  /** 开始窗口翻译 (初始: 当前页 + 下 5 页) */
  const startWindowTranslate = useCallback(
    async (startPage: number) => {
      if (!(await translateService.isConfigured())) {
        return { configured: false }
      }

      const layerData = useEditorStore.getState().layerData
      const totalPages = Object.keys(layerData).length
      const existingController = useTranslateStore.getState().abortController

      // 如果已在运行, 先停止
      if (existingController) {
        existingController.abort()
      }

      const controller = new AbortController()
      setAbortController(controller)
      setSessionActive(true)
      initBatch(totalPages)

      const endPage = Math.min(startPage + INITIAL_WINDOW - 1, totalPages)
      logger.info(`startWindowTranslate: pages [${startPage}, ${endPage}] / ${totalPages}`)

      setBatchStatus('running')
      try {
        await translatePageRange(startPage, endPage, controller.signal)
      } catch (err) {
        logger.error(`startWindowTranslate error:`, err)
      }

      if (!controller.signal.aborted) {
        setBatchStatus('prefetching')
      }
      return { configured: true }
    },
    [initBatch, setSessionActive, setAbortController, setBatchStatus, translatePageRange],
  )

  /** 扩展窗口 (预热: 从 coverageEdge+1 翻译下 5 页) */
  const extendWindow = useCallback(
    async () => {
      if (isExtendingRef.current) return
      const batch = useTranslateStore.getState().batch
      if (!batch.sessionActive) return
      if (batch.coverageEdge >= batch.totalPages) return

      isExtendingRef.current = true
      const controller = useTranslateStore.getState().abortController
      if (!controller || controller.signal.aborted) {
        isExtendingRef.current = false
        return
      }

      const startPage = batch.coverageEdge + 1
      const endPage = Math.min(startPage + PREFETCH_BATCH - 1, batch.totalPages)
      logger.info(`extendWindow: pages [${startPage}, ${endPage}]`)

      setBatchStatus('running')
      try {
        await translatePageRange(startPage, endPage, controller.signal)
      } catch (err) {
        logger.error(`extendWindow error:`, err)
      }

      if (!controller.signal.aborted) {
        setBatchStatus('prefetching')
      }
      isExtendingRef.current = false
    },
    [setBatchStatus, translatePageRange],
  )

  /** 停止翻译会话 */
  const stopSession = useCallback(() => {
    logger.info('stopSession')
    const controller = useTranslateStore.getState().abortController
    if (controller) controller.abort()
    setSessionActive(false)
    setBatchStatus('stopped')
    setAbortController(null)
  }, [setSessionActive, setBatchStatus, setAbortController])

  /** 预热 effect: 滚动接近覆盖边缘时自动扩展 */
  const currentPage = useEditorStore((s) => s.currentPage)
  const coverageEdge = useTranslateStore((s) => s.batch.coverageEdge)
  const sessionActive = useTranslateStore((s) => s.batch.sessionActive)
  const batchStatus = useTranslateStore((s) => s.batch.status)
  const totalPages = useTranslateStore((s) => s.batch.totalPages)

  useEffect(() => {
    if (!sessionActive) return
    if (batchStatus !== 'prefetching' && batchStatus !== 'running') return
    if (coverageEdge >= totalPages) return

    // 跳跃: 当前页远超覆盖范围 → 以当前页重开窗口 (debounce 合并连续跳跃)
    if (currentPage > coverageEdge + PREFETCH_EDGE) {
      if (jumpDebounceRef.current) clearTimeout(jumpDebounceRef.current)
      jumpDebounceRef.current = setTimeout(() => {
        logger.info(`jump detected: currentPage=${currentPage} > coverageEdge+${PREFETCH_EDGE}=${coverageEdge + PREFETCH_EDGE}, re-window`)
        startWindowTranslate(currentPage)
      }, 300)
      return
    }

    // 连续预热: 接近边缘 → 扩展
    if (currentPage + PREFETCH_EDGE >= coverageEdge) {
      extendWindow()
    }
  }, [currentPage, coverageEdge, sessionActive, batchStatus, totalPages, startWindowTranslate, extendWindow])

  return {
    translateSelection,
    startWindowTranslate,
    extendWindow,
    stopSession,
    isTranslatable,
    isLikelyTranslatable,
    splitLongText,
  }
}
