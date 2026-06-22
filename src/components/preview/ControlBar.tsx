import { useState, useCallback } from 'react'
import { getModelVersionLabel } from '@/utils/modelVersion'
import { genUniqFolderName } from '@/utils/url'
import { useUIStore } from '@/stores/uiStore'
import type { TaskData } from '@/shared/types'
import { ExportFormat } from '@/shared/types'
import { openFolder } from '@/service/preview.service'
import { createLogger } from '@/utils/logger'

const logger = createLogger('ControlBar')

interface ControlBarProps {
  task: TaskData
  loading: boolean
  isHtmlParse?: boolean
  onBack?: () => void
  onFavorite?: () => void
  onOpenFolder?: (path: string) => void
  onExport?: (format: ExportFormat) => void
}

export function ControlBar({ task, loading, onBack, onFavorite, onOpenFolder, onExport }: ControlBarProps) {
  const { toggleSidebar } = useUIStore()
  const [copied, setCopied] = useState(false)
  const [favorited, setFavorited] = useState(false)

  const handleBack = useCallback(() => {
    logger.info('Back button clicked')
    if (onBack) {
      onBack()
    } else {
      if (window.history.length > 1) {
        window.history.back()
      } else {
        window.location.hash = '/'
      }
    }
  }, [onBack])

  const handleToggleSidebar = useCallback(() => {
    logger.info('Toggle sidebar')
    toggleSidebar()
  }, [toggleSidebar])

  const handleCopyTaskId = useCallback(async () => {
    const id = task.task_id || task.data_id
    logger.info(`Copy task ID: "${id}"`)
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = id
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [task.task_id, task.data_id])

  const handleFavorite = useCallback(async () => {
    if (favorited) {
      logger.info('Already favorited, skipping')
      return
    }
    logger.info(`Favorite task: "${task.file_name}"`)
    setFavorited(true)
    onFavorite?.()
    logger.info('Task favorited successfully')
  }, [task.file_name, favorited, onFavorite])

  const handleOpenFolder = useCallback(async () => {
    logger.info(`Open folder for task: "${task.file_name}"`)
    if (onOpenFolder) {
      const folderName = genUniqFolderName(task)
      onOpenFolder(folderName)
    } else if (task.unzip_file_output_path) {
      await openFolder(task.unzip_file_output_path)
    }
  }, [task, onOpenFolder])

  const handleExport = useCallback((format: ExportFormat) => {
    logger.info(`Export task "${task.data_id}" as ${format}`)
    onExport?.(format)
  }, [task.data_id, onExport])

  return (
    <div className="flex items-center justify-between px-4 h-11 border-b border-gray-200 bg-white shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={handleToggleSidebar}
          className="btn btn-icon btn-ghost hidden"
          title="切换侧边栏"
        >
          ☰
        </button>
        <button onClick={handleBack} className="btn btn-icon btn-ghost" title="返回">
          ←
        </button>
        <span className="text-sm font-medium truncate max-w-[200px]" title={task.file_name}>
          {task.file_name}
        </span>
        <button
          onClick={handleCopyTaskId}
          className="btn btn-text-muted btn-sm"
          title="复制任务 ID"
        >
          {copied ? '✓' : '📋'}
        </button>
        <span className="tag tag-blue">
          {getModelVersionLabel(task.model_version)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {!loading && (task.state === 'unzipped' || task.state === 'done') && (
          <>
            <button
              onClick={handleFavorite}
              className={`btn btn-icon btn-ghost ${favorited ? 'text-yellow-500' : ''}`}
              title={favorited ? '已收藏' : '收藏'}
            >
              {favorited ? '★' : '☆'}
            </button>
            <button
              onClick={handleOpenFolder}
              className="btn btn-icon btn-ghost"
              title="打开文件夹"
            >
              📂
            </button>
            <select
              onChange={(e) => handleExport(e.target.value as ExportFormat)}
              className="btn btn-sm"
              defaultValue=""
              style={{ width: 'auto', minWidth: 80, cursor: 'pointer' }}
            >
              <option value="" disabled>导出</option>
              <option value={ExportFormat.MARKDOWN}>Markdown</option>
              <option value={ExportFormat.HTML}>HTML</option>
              <option value={ExportFormat.JSON}>JSON</option>
            </select>
          </>
        )}
      </div>
    </div>
  )
}
