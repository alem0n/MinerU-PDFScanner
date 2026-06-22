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
  const setFloatingResult = useTranslateStore((s) => s.setFloatingResult)
  const setFloatingStatus = useTranslateStore((s) => s.setFloatingStatus)
  const updateFloatingTarget = useTranslateStore((s) => s.updateFloatingTarget)
  const clearFloating = useTranslateStore((s) => s.clearFloating)
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

  /** 右键选中翻译 → 浮动面板 (单条, 新替旧) */
  const translateSelection = useCallback(
    async (selectedText: string, x: number, y: number) => {
      const text = selectedText.trim()
      if (!text) return

      setFloatingResult({ source: text, target: '', status: 'requesting', x, y })

      try {
        if (!(await translateService.isConfigured())) {
          throw new TranslateError('翻译引擎未配置, 请先在设置中配置', 'config')
        }
        const results = await translateService.translate([text])
        if (results.length > 0) {
          updateFloatingTarget(results[0].text)
        } else {
          setFloatingStatus('error', '未返回有效译文')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setFloatingStatus('cancelled')
          return
        }
        const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
        setFloatingStatus('error', msg)
        logger.warn(`translateSelection failed: ${msg}`)
      }
    },
    [setFloatingResult, setFloatingStatus, updateFloatingTarget],
  )

  /** 重试浮动翻译 */
  const retryFloating = useCallback(async () => {
    const cur = useTranslateStore.getState().floatingTranslation
    if (!cur || cur.status === 'requesting') return
    setFloatingStatus('requesting')
    try {
      if (!(await translateService.isConfigured())) {
        throw new TranslateError('翻译引擎未配置, 请先在设置中配置', 'config')
      }
      const results = await translateService.translate([cur.source])
      if (results.length > 0) {
        updateFloatingTarget(results[0].text)
      } else {
        setFloatingStatus('error', '未返回有效译文')
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setFloatingStatus('cancelled')
        return
      }
      const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
      setFloatingStatus('error', msg)
      logger.warn(`retryFloating failed: ${msg}`)
    }
  }, [setFloatingStatus, updateFloatingTarget])

  /** 右键块翻译 (无选中时) → 写入 blockTranslations, 原文下方显示 + 全文翻译缓存命中跳过 */
  const translateBlock = useCallback(
    async (blockId: string, text: string, blockPosition?: string) => {
      const source = text.trim()
      if (!source) return

      setBlockResult(blockId, { blockPosition, source, target: '', status: 'requesting' })

      try {
        if (!(await translateService.isConfigured())) {
          throw new TranslateError('翻译引擎未配置, 请先在设置中配置', 'config')
        }
        const results = await translateService.translate([source])
        if (results.length > 0) {
          setBlockResult(blockId, { blockPosition, source, target: results[0].text, status: 'done' })
        } else {
          setBlockStatus(blockId, 'error', '未返回有效译文')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setBlockStatus(blockId, 'cancelled')
          return
        }
        const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
        setBlockStatus(blockId, 'error', msg)
        logger.warn(`translateBlock failed: ${msg}`)
      }
    },
    [setBlockResult, setBlockStatus],
  )

  /** 翻译一个页范围 (内部核心) */
  const translatePageRange = useCallback(
    async (startPage: number, endPage: number, signal: AbortSignal) => {
      const stepLogger = createLogger('translatePageRange')
      stepLogger.info(`[全文翻译] ═══ 进入translatePageRange ═══ startPage=${startPage}, endPage=${endPage}`)

      const layerData = useEditorStore.getState().layerData
      const blockTranslations = useTranslateStore.getState().blockTranslations
      const cfg = await translateService.getConfig()
      stepLogger.info(`[全文翻译] 配置: apiType=${cfg.apiType}, model=${cfg.model}, targetLang=${cfg.targetLang}, enabled=${cfg.enabled}`)

      // 收集所有待翻译块 (跨页)
      const pageBlocks: Map<number, BlockData[]> = new Map()
      const allBlocks: BlockData[] = []
      let totalBlockCount = 0
      for (let pg = startPage; pg <= endPage; pg++) {
        const blocks = layerData[pg - 1] || []
        totalBlockCount += blocks.length
        stepLogger.info(`[全文翻译] 页${pg}: layerData[${pg - 1}]共有${blocks.length}个块`)
        markPageTranslating(pg)
        const translatable = blocks.filter((b) => isTranslatable(b) && isLikelyTranslatable(b.text))
        const nonTranslatable = blocks.filter((b) => !isTranslatable(b))
        const nonLikely = blocks.filter((b) => isTranslatable(b) && !isLikelyTranslatable(b.text))
        stepLogger.info(`[全文翻译] 页${pg}过滤结果: 可翻译=${translatable.length}, 不可翻译(类型过滤)=${nonTranslatable.length}, 不可翻译(内容过滤)=${nonLikely.length}`)
        pageBlocks.set(pg, translatable)
        allBlocks.push(...translatable)
      }
      stepLogger.info(`[全文翻译] 汇总: 总共${totalBlockCount}个块, 过滤后可翻译=${allBlocks.length}个块`)

      // 去重: 相同 text 只翻译一次
      const textToBlocks = new Map<string, BlockData[]>()
      let cacheHitCount = 0
      for (const block of allBlocks) {
        // 缓存命中: 已有 done 译文且原文未变
        const existing = blockTranslations[block.id]
        if (existing && existing.status === 'done' && existing.source === block.text) {
          cacheHitCount++
          stepLogger.info(`[全文翻译] 缓存命中: blockId=${block.id}, text="${block.text.slice(0, 50)}..."`)
          continue
        }
        const arr = textToBlocks.get(block.text)
        if (arr) arr.push(block)
        else textToBlocks.set(block.text, [block])
      }
      stepLogger.info(`[全文翻译] 缓存命中=${cacheHitCount}块, 去重前唯一文本=${textToBlocks.size}`)

      const uniqueTexts = Array.from(textToBlocks.keys())
      const totalTasks = uniqueTexts.length
      let done = 0
      let failed = 0

      stepLogger.info(`[全文翻译] 最终需翻译的唯一文本数=${totalTasks}`)

      startBatch(totalTasks)

      if (totalTasks === 0) {
        stepLogger.info(`[全文翻译] 无可翻译块, 直接标记页完成`)
        // 无可翻译块, 所有页直接标记完成
        for (let pg = startPage; pg <= endPage; pg++) {
          markPageTranslated(pg)
          updateCoverageEdge(pg)
        }
        return
      }

      // 并发翻译 (semaphore 在 service 层控制)
      const promises = uniqueTexts.map(async (text, idx) => {
        if (signal.aborted) {
          stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 信号中断, 跳过: text="${text.slice(0, 50)}..."`)
          return
        }
        const blocks = textToBlocks.get(text)!
        stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 开始翻译: text长度=${text.length}, text预览="${text.slice(0, 60)}...", 关联${blocks.length}个块: [${blocks.map(b => b.id).join(', ')}]`)
        for (const b of blocks) {
          setBlockStatus(b.id, 'requesting')
        }
        try {
          // 超长分段
          if (text.length > cfg.maxChunkChars) {
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 超长文本(${text.length} > ${cfg.maxChunkChars}), 开始分段`)
            const segments = splitLongText(text, cfg.maxChunkChars)
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 分段数=${segments.length}, 各段长度=${segments.map(s => s.length)}`)
            const segResults: string[] = []
            for (let si = 0; si < segments.length; si++) {
              if (signal.aborted) {
                stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 分段${si + 1}翻译前信号中断`)
                return
              }
              stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 翻译分段${si + 1}/${segments.length}, 长度=${segments[si].length}`)
              const r = await translateService.translate([segments[si]], { signal })
              stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 分段${si + 1}翻译完成: 结果长度=${r.length > 0 ? r[0].text.length : 0}`)
              if (r.length > 0) segResults.push(r[0].text)
            }
            const combined = segResults.join('\n')
            done++
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 分段翻译完成, 合并后长度=${combined.length}, 结果预览="${combined.slice(0, 60)}..."`)
            for (const b of blocks) {
              setBlockResult(b.id, {
                blockPosition: b.block_position,
                source: text,
                target: combined,
                status: 'done',
              })
            }
          } else {
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 开始调用translateService.translate`)
            const startTime = Date.now()
            const results = await translateService.translate([text], { signal })
            const elapsed = Date.now() - startTime
            done++
            const target = results[0]?.text || ''
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] translate完成: 耗时=${elapsed}ms, 原文长度=${text.length}, 译文长度=${target.length}, 译文预览="${target.slice(0, 60)}..."`)
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
          if (err?.name === 'AbortError') {
            stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 被AbortError中断`)
            return
          }
          failed++
          const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
          stepLogger.error(`[全文翻译] [${idx + 1}/${totalTasks}] 翻译失败: code=${err instanceof TranslateError ? err.code : 'unknown'}, status=${err instanceof TranslateError ? err.status : 'N/A'}, message=${msg}`)
          for (const b of blocks) {
            setBlockStatus(b.id, 'error', msg)
          }
        } finally {
          updateBatchProgress(done, failed)
          stepLogger.info(`[全文翻译] [${idx + 1}/${totalTasks}] 完成, 累计: done=${done}, failed=${failed}`)
        }
      })

      await Promise.allSettled(promises)
      stepLogger.info(`[全文翻译] 所有翻译任务完成: done=${done}, failed=${failed}`)

      // 标记页完成
      for (let pg = startPage; pg <= endPage; pg++) {
        markPageTranslated(pg)
        updateCoverageEdge(pg)
      }
      stepLogger.info(`[全文翻译] ═══ translatePageRange 完成 ═══`)
    },
    [startBatch, setBlockStatus, setBlockResult, updateBatchProgress, markPageTranslated, markPageTranslating, unmarkPageTranslating, updateCoverageEdge],
  )

  /** 开始窗口翻译 (初始: 当前页 + 下 5 页) */
  const startWindowTranslate = useCallback(
    async (startPage: number) => {
      const logger = createLogger('startWindowTranslate')
      logger.info(`[全文翻译] 进入startWindowTranslate: startPage=${startPage}`)

      const isConfigured = await translateService.isConfigured()
      logger.info(`[全文翻译] isConfigured: ${isConfigured}`)
      if (!isConfigured) {
        return { configured: false }
      }

      const cfg = await translateService.getConfig()
      logger.info(`[全文翻译] 配置详情: apiType=${cfg.apiType}, model=${cfg.model}, targetLang=${cfg.targetLang}, apiUrl=${cfg.apiUrl ? '已设置' : '未设置'}, apiKey=${cfg.apiKey ? '已设置' : '未设置'}, enabled=${cfg.enabled}, useBatchFetch=${cfg.useBatchFetch}, timeoutMs=${cfg.timeoutMs}, retryTimes=${cfg.retryTimes}`)

      const layerData = useEditorStore.getState().layerData
      const totalPages = Object.keys(layerData).length
      const existingController = useTranslateStore.getState().abortController

      logger.info(`[全文翻译] layerData页数=${totalPages}, 各页块数=${Object.entries(layerData).map(([k, v]) => `p${k}:${v.length}`).join(', ')}`)

      // 如果已在运行, 先停止
      if (existingController) {
        logger.info(`[全文翻译] 已有运行中会话, 先abort`)
        existingController.abort()
      }

      const controller = new AbortController()
      setAbortController(controller)
      setSessionActive(true)
      initBatch(totalPages)

      const endPage = Math.min(startPage + INITIAL_WINDOW - 1, totalPages)
      logger.info(`[全文翻译] 窗口范围: [${startPage}, ${endPage}] / 共${totalPages}页, INITIAL_WINDOW=${INITIAL_WINDOW}`)

      setBatchStatus('running')
      try {
        logger.info(`[全文翻译] 开始调用translatePageRange`)
        await translatePageRange(startPage, endPage, controller.signal)
        logger.info(`[全文翻译] translatePageRange完成, aborted=${controller.signal.aborted}`)
      } catch (err) {
        logger.error(`[全文翻译] translatePageRange异常:`, err)
      }

      if (!controller.signal.aborted) {
        logger.info(`[全文翻译] 翻译未中断, 设置状态为prefetching`)
        setBatchStatus('prefetching')
      } else {
        logger.info(`[全文翻译] 翻译已被中断`)
      }
      logger.info(`[全文翻译] startWindowTranslate完成, 返回 { configured: true }`)
      return { configured: true }
    },
    [initBatch, setSessionActive, setAbortController, setBatchStatus, translatePageRange],
  )

  /** 扩展窗口 (预热: 从 coverageEdge+1 翻译下 5 页) */
  const extendWindow = useCallback(
    async () => {
      if (isExtendingRef.current) {
        logger.info(`[extendWindow] 已在扩展中, 跳过`)
        return
      }
      const batch = useTranslateStore.getState().batch
      logger.info(`[extendWindow] 检查扩展条件: sessionActive=${batch.sessionActive}, coverageEdge=${batch.coverageEdge}, totalPages=${batch.totalPages}, batchStatus=${batch.status}`)
      if (!batch.sessionActive) return
      if (batch.coverageEdge >= batch.totalPages) return

      isExtendingRef.current = true
      const controller = useTranslateStore.getState().abortController
      if (!controller || controller.signal.aborted) {
        logger.info(`[extendWindow] controller已aborted或不存在, 跳过`)
        isExtendingRef.current = false
        return
      }

      const startPage = batch.coverageEdge + 1
      const endPage = Math.min(startPage + PREFETCH_BATCH - 1, batch.totalPages)
      logger.info(`[extendWindow] 开始扩展: pages [${startPage}, ${endPage}] / ${batch.totalPages}, PREFETCH_BATCH=${PREFETCH_BATCH}`)

      setBatchStatus('running')
      try {
        await translatePageRange(startPage, endPage, controller.signal)
        logger.info(`[extendWindow] 扩展翻译完成: pages [${startPage}, ${endPage}]`)
      } catch (err) {
        logger.error(`[extendWindow] 扩展翻译异常:`, err)
      }

      if (!controller.signal.aborted) {
        logger.info(`[extendWindow] 翻译未中断, 设置状态为prefetching`)
        setBatchStatus('prefetching')
      } else {
        logger.info(`[extendWindow] 翻译已被中断`)
      }
      isExtendingRef.current = false
    },
    [setBatchStatus, translatePageRange],
  )

  /** 停止翻译会话 */
  const stopSession = useCallback(() => {
    logger.info(`[stopSession] 停止翻译会话`)
    const controller = useTranslateStore.getState().abortController
    if (controller) {
      logger.info(`[stopSession] abortController已存在, 执行abort`)
      controller.abort()
    } else {
      logger.info(`[stopSession] abortController为null, 跳过abort`)
    }
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
    logger.info(`[prefetchEffect] 触发: currentPage=${currentPage}, coverageEdge=${coverageEdge}, sessionActive=${sessionActive}, batchStatus=${batchStatus}, totalPages=${totalPages}, PREFETCH_EDGE=${PREFETCH_EDGE}`)
    if (!sessionActive) {
      logger.info(`[prefetchEffect] sessionActive=false, 跳过`)
      return
    }
    if (batchStatus !== 'prefetching' && batchStatus !== 'running') {
      logger.info(`[prefetchEffect] batchStatus=${batchStatus} 不是prefetching/running, 跳过`)
      return
    }
    if (coverageEdge >= totalPages) {
      logger.info(`[prefetchEffect] 已覆盖全部页面(${coverageEdge} >= ${totalPages}), 跳过`)
      return
    }

    // 跳跃: 当前页远超覆盖范围 → 以当前页重开窗口 (debounce 合并连续跳跃)
    if (currentPage > coverageEdge + PREFETCH_EDGE) {
      logger.info(`[prefetchEffect] 跳跃检测: currentPage=${currentPage} > coverageEdge(${coverageEdge})+PREFETCH_EDGE(${PREFETCH_EDGE})=${coverageEdge + PREFETCH_EDGE}, 300ms后重新窗口化`)
      if (jumpDebounceRef.current) clearTimeout(jumpDebounceRef.current)
      jumpDebounceRef.current = setTimeout(() => {
        logger.info(`[prefetchEffect] 跳跃执行: 以currentPage=${currentPage}重新窗口化`)
        startWindowTranslate(currentPage)
      }, 300)
      return
    }

    // 连续预热: 接近边缘 → 扩展
    if (currentPage + PREFETCH_EDGE >= coverageEdge) {
      logger.info(`[prefetchEffect] 预热触发: currentPage(${currentPage})+PREFETCH_EDGE(${PREFETCH_EDGE})=${currentPage + PREFETCH_EDGE} >= coverageEdge(${coverageEdge}), 调用extendWindow`)
      extendWindow()
    } else {
      logger.info(`[prefetchEffect] 未满足预热条件: currentPage(${currentPage})+PREFETCH_EDGE(${PREFETCH_EDGE})=${currentPage + PREFETCH_EDGE} < coverageEdge(${coverageEdge})`)
    }
  }, [currentPage, coverageEdge, sessionActive, batchStatus, totalPages, startWindowTranslate, extendWindow])

  return {
    translateSelection,
    retryFloating,
    translateBlock,
    clearFloating,
    startWindowTranslate,
    extendWindow,
    stopSession,
    isTranslatable,
    isLikelyTranslatable,
    splitLongText,
  }
}
