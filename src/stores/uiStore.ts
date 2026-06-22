import { create } from 'zustand'
import { createLogger } from '@/utils/logger'

const logger = createLogger('uiStore')

interface UIStore {
  sidebarWidth: number
  sidebarOpen: boolean
  deleteLocal: boolean

  setSidebarWidth: (w: number) => void
  toggleSidebar: () => void
  setDeleteLocal: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarWidth: 260,
  sidebarOpen: true,
  deleteLocal: true,

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
}))
