import { create } from 'zustand'
import { createLogger } from '@/utils/logger'

const logger = createLogger('uiStore')

// Preview Tab 视图类型 — 对应迁移方案 A1 中 RightPanel 的 Tab 切换（md/json/chem）
export type PreviewViewType = 'md' | 'json' | 'chem'

interface UIStore {
  sidebarWidth: number
  sidebarOpen: boolean
  deleteLocal: boolean
  // Preview 面板状态 — 迁移方案 B1：viewType 控制 md/json/chem Tab 切换；showLayout 控制块视图/纯 Markdown 切换
  viewType: PreviewViewType
  showLayout: boolean

  setSidebarWidth: (w: number) => void
  toggleSidebar: () => void
  setDeleteLocal: (v: boolean) => void
  setViewType: (v: PreviewViewType) => void
  setShowLayout: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarWidth: 260,
  sidebarOpen: true,
  deleteLocal: true,
  // 迁移方案默认值：显示块视图（MainMarkdownViewer），可在 Tab 栏切换为纯 Markdown（MarkdownRenderer）
  viewType: 'md',
  showLayout: true,

  setSidebarWidth: (w) => {
    logger.info(`setSidebarWidth: ${w}`)
    set({ sidebarWidth: w })
  },
  toggleSidebar: () => {
    logger.info('toggleSidebar')
    set((s) => ({ sidebarOpen: !s.sidebarOpen }))
  },
  setDeleteLocal: (v) => {
    logger.info(`setDeleteLocal: ${v}`)
    set({ deleteLocal: v })
  },
  setViewType: (v) => {
    logger.info(`setViewType: ${v}`)
    set({ viewType: v })
  },
  setShowLayout: (v) => {
    logger.info(`setShowLayout: ${v}`)
    set({ showLayout: v })
  },
}))
