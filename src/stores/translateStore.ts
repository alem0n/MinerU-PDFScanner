/**
 * 翻译状态 Store (Zustand)
 *
 * 作为 UI 与 translateService 之间的状态桥。
 * 包含: 块级译文缓存、右键选中译文、全文翻译窗口化批次状态。
 *
 * 窗口化策略 (增补方案):
 *  - 初始: 翻译 [currentPage, currentPage+5] 共 6 页
 *  - 预热: 滚动接近覆盖边缘时自动扩展 5 页
 *  - 缓存: 已翻译页累积保留, 回看命中缓存不重发
 */
import { create } from 'zustand'
import { createLogger } from '@/utils/logger'

const logger = createLogger('translateStore')

/** 单块翻译状态 */
export type TranslationStatus = 'pending' | 'requesting' | 'done' | 'error' | 'skipped' | 'cancelled'

/** 全文翻译块级结果 (按 blockId 存, 累积缓存) */
export interface BlockTranslation {
  blockId: string
  blockPosition?: string
  /** 原文快照 (用于检测原文是否变更) */
  source: string
  /** 译文 */
  target: string
  status: TranslationStatus
  /** 错误信息 */
  error?: string
  /** 时间戳 */
  at: number
}

/** 右键选中翻译结果 (一个块可多条) */
export interface SelectionTranslation {
  /** 选中原文片段 */
  source: string
  /** 译文 */
  target: string
  status: TranslationStatus
  error?: string
  at: number
}

/** 全文翻译批次状态 */
export type BatchStatus = 'idle' | 'running' | 'prefetching' | 'stopped' | 'cancelled'

/** 全文翻译窗口化状态 */
export interface BatchState {
  status: BatchStatus
  /** 当前批进度 */
  batchTotal: number
  batchDone: number
  batchFailed: number
  /** 已完成翻译的页 (累积, 1-indexed) */
  translatedPageSet: Set<number>
  /** 进行中的页 */
  translatingPageSet: Set<number>
  /** 已覆盖到的最大页索引 (1-indexed, 初始 0) */
  coverageEdge: number
  /** 翻译会话是否开启 (首次点击后 true, 停止后 false) */
  sessionActive: boolean
  /** 总页数 */
  totalPages: number
}

/** 全文翻译常量 */
export const INITIAL_WINDOW = 6
export const PREFETCH_BATCH = 5
export const PREFETCH_EDGE = 2

export interface TranslateStore {
  /** 全文翻译: 按 blockId 存 (累积缓存, 窗口滑动不清除) */
  blockTranslations: Record<string, BlockTranslation>
  /** 右键选中翻译: 按 blockId 存 (一个块可多条) */
  selectionTranslations: Record<string, SelectionTranslation[]>
  /** 全文翻译批次状态 */
  batch: BatchState
  /** 取消信号句柄 */
  abortController: AbortController | null

  // === Actions ===

  /** 设置块翻译结果 */
  setBlockResult: (blockId: string, result: Partial<BlockTranslation> & { source: string; target: string }) => void
  /** 设置块状态 */
  setBlockStatus: (blockId: string, status: TranslationStatus, error?: string) => void
  /** 添加右键选中翻译结果 */
  addSelectionResult: (blockId: string, result: Partial<SelectionTranslation> & { source: string; target: string }) => void
  /** 设置右键选中翻译状态 */
  setSelectionStatus: (blockId: string, index: number, status: TranslationStatus, error?: string) => void
  /** 移除单块译文 */
  removeBlockTranslation: (blockId: string) => void
  /** 移除右键选中翻译 */
  removeSelectionTranslation: (blockId: string, index: number) => void

  /** 初始化批次 (设置 totalPages, sessionActive) */
  initBatch: (totalPages: number) => void
  /** 开始一个翻译批次 */
  startBatch: (total: number) => void
  /** 批次进度更新 */
  updateBatchProgress: (done: number, failed: number) => void
  /** 标记页为已翻译 */
  markPageTranslated: (page: number) => void
  /** 标记页为翻译中 */
  markPageTranslating: (page: number) => void
  /** 取消翻译中页标记 */
  unmarkPageTranslating: (page: number) => void
  /** 更新覆盖边缘 */
  updateCoverageEdge: (page: number) => void
  /** 设置批次状态 */
  setBatchStatus: (status: BatchStatus) => void
  /** 设置会话激活 */
  setSessionActive: (active: boolean) => void
  /** 设置 abortController */
  setAbortController: (controller: AbortController | null) => void

  /** 清空全部 (切任务/路由时调用) */
  clearAll: () => void
}

const initialBatch: BatchState = {
  status: 'idle',
  batchTotal: 0,
  batchDone: 0,
  batchFailed: 0,
  translatedPageSet: new Set<number>(),
  translatingPageSet: new Set<number>(),
  coverageEdge: 0,
  sessionActive: false,
  totalPages: 0,
}

export const useTranslateStore = create<TranslateStore>()((set) => ({
  blockTranslations: {},
  selectionTranslations: {},
  batch: { ...initialBatch },
  abortController: null,

  setBlockResult: (blockId, result) => {
    set((state) => ({
      blockTranslations: {
        ...state.blockTranslations,
        [blockId]: {
          blockId,
          blockPosition: result.blockPosition,
          source: result.source,
          target: result.target,
          status: result.status || 'done',
          error: result.error,
          at: Date.now(),
        },
      },
    }))
  },

  setBlockStatus: (blockId, status, error) => {
    set((state) => {
      const existing = state.blockTranslations[blockId]
      if (!existing) return {}
      return {
        blockTranslations: {
          ...state.blockTranslations,
          [blockId]: { ...existing, status, error, at: Date.now() },
        },
      }
    })
  },

  addSelectionResult: (blockId, result) => {
    set((state) => {
      const existing = state.selectionTranslations[blockId] || []
      return {
        selectionTranslations: {
          ...state.selectionTranslations,
          [blockId]: [
            ...existing,
            {
              source: result.source,
              target: result.target,
              status: result.status || 'done',
              error: result.error,
              at: Date.now(),
            },
          ],
        },
      }
    })
  },

  setSelectionStatus: (blockId, index, status, error) => {
    set((state) => {
      const list = state.selectionTranslations[blockId]
      if (!list || !list[index]) return {}
      const newList = [...list]
      newList[index] = { ...newList[index], status, error, at: Date.now() }
      return {
        selectionTranslations: {
          ...state.selectionTranslations,
          [blockId]: newList,
        },
      }
    })
  },

  removeBlockTranslation: (blockId) => {
    set((state) => {
      const { [blockId]: _, ...rest } = state.blockTranslations
      return { blockTranslations: rest }
    })
  },

  removeSelectionTranslation: (blockId, index) => {
    set((state) => {
      const list = state.selectionTranslations[blockId]
      if (!list) return {}
      const newList = list.filter((_, i) => i !== index)
      return {
        selectionTranslations: {
          ...state.selectionTranslations,
          [blockId]: newList,
        },
      }
    })
  },

  initBatch: (totalPages) => {
    set((state) => ({
      batch: { ...state.batch, totalPages, sessionActive: true },
    }))
    logger.info(`initBatch: totalPages=${totalPages}`)
  },

  startBatch: (total) => {
    set((state) => ({
      batch: { ...state.batch, status: 'running', batchTotal: total, batchDone: 0, batchFailed: 0 },
    }))
    logger.info(`startBatch: total=${total}`)
  },

  updateBatchProgress: (done, failed) => {
    set((state) => ({
      batch: { ...state.batch, batchDone: done, batchFailed: failed },
    }))
  },

  markPageTranslated: (page) => {
    set((state) => {
      const translatedPageSet = new Set(state.batch.translatedPageSet)
      translatedPageSet.add(page)
      const translatingPageSet = new Set(state.batch.translatingPageSet)
      translatingPageSet.delete(page)
      return { batch: { ...state.batch, translatedPageSet, translatingPageSet } }
    })
  },

  markPageTranslating: (page) => {
    set((state) => {
      const translatingPageSet = new Set(state.batch.translatingPageSet)
      translatingPageSet.add(page)
      return { batch: { ...state.batch, translatingPageSet } }
    })
  },

  unmarkPageTranslating: (page) => {
    set((state) => {
      const translatingPageSet = new Set(state.batch.translatingPageSet)
      translatingPageSet.delete(page)
      return { batch: { ...state.batch, translatingPageSet } }
    })
  },

  updateCoverageEdge: (page) => {
    set((state) => ({
      batch: { ...state.batch, coverageEdge: Math.max(state.batch.coverageEdge, page) },
    }))
  },

  setBatchStatus: (status) => {
    set((state) => ({ batch: { ...state.batch, status } }))
    logger.info(`batch status -> ${status}`)
  },

  setSessionActive: (active) => {
    set((state) => ({ batch: { ...state.batch, sessionActive: active } }))
  },

  setAbortController: (controller) => {
    set({ abortController: controller })
  },

  clearAll: () => {
    logger.info('clearAll: clearing translations and batch state')
    set({
      blockTranslations: {},
      selectionTranslations: {},
      batch: { ...initialBatch },
      abortController: null,
    })
  },
}))
