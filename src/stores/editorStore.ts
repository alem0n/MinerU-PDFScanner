import { create } from 'zustand'
import type { BlockData } from '@/shared/types'
import { createLogger } from '@/utils/logger'

const logger = createLogger('editorStore')

export interface EditInfo {
  id: string
  type: string
  content: string
  blockId: string
}

export interface EditedBlock {
  block_position: string
  updated_at: number
}

export interface EditorStore {
  layerData: Record<number, BlockData[]>
  editInfo: EditInfo | null
  editedBlocks: Record<string, EditedBlock>
  activeBlockId: string | null
  activeBlockSource: 'pdf' | 'markdown' | null

  setLayerData: (data: BlockData[][]) => void
  setEditInfo: (info: EditInfo | null) => void
  clearEditInfo: () => void
  updateBlockContent: (blockPosition: string, newContent: string) => void
  setActiveBlockId: (id: string | null, source?: 'pdf' | 'markdown') => void
  markEdited: (blockPosition: string) => void
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  layerData: {},
  editInfo: null,
  editedBlocks: {},
  activeBlockId: null,
  activeBlockSource: null,

  setLayerData: (data: BlockData[][]) => {
    logger.info(`setLayerData: ${data.length} pages, ${data.reduce((s, p) => s + p.length, 0)} blocks`)
    const record: Record<number, BlockData[]> = {}
    data.forEach((page, idx) => { record[idx] = page })
    set({ layerData: record })
  },

  setEditInfo: (info: EditInfo | null) => {
    const prev = get().editInfo
    if (info === null && prev === null) return
    if (info !== null && prev !== null) {
      if (info.id === prev.id && info.content === prev.content && info.type === prev.type && info.blockId === prev.blockId) {
        return
      }
    }
    if (info) {
      logger.info(`setEditInfo: id="${info.id}", type="${info.type}"`)
    } else {
      logger.info('setEditInfo: null')
    }
    set({ editInfo: info })
  },

  clearEditInfo: () => {
    logger.info('clearEditInfo')
    set({ editInfo: null })
  },

  updateBlockContent: (blockPosition: string, newContent: string) => {
    logger.info(`updateBlockContent: position="${blockPosition}", length=${newContent.length}`)
    set((state) => {
      const newData = { ...state.layerData }
      for (const pageIdx of Object.keys(newData)) {
        const page = newData[Number(pageIdx)]
        for (const block of page) {
          if (block.block_position === blockPosition) {
            block.text = newContent
            block.content = newContent
            return { layerData: { ...newData } }
          }
        }
      }
      logger.warn(`updateBlockContent: block "${blockPosition}" not found`)
      return {}
    })
  },

  setActiveBlockId: (id: string | null, source?: 'pdf' | 'markdown') => {
    if (id) {
      logger.info(`setActiveBlockId: "${id}" from "${source || 'unknown'}"`)
    } else {
      logger.info('setActiveBlockId: null')
    }
    set({ activeBlockId: id, activeBlockSource: source ?? null })
  },

  markEdited: (blockPosition: string) => {
    logger.info(`markEdited: "${blockPosition}"`)
    set((state) => ({
      editedBlocks: {
        ...state.editedBlocks,
        [blockPosition]: {
          block_position: blockPosition,
          updated_at: Date.now() / 1000,
        },
      },
    }))
  },
}))
