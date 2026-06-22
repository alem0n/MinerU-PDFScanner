import { useState, useCallback } from 'react'
import { getModelVersionLabel } from '@/utils/modelVersion'
import { genUniqFolderName } from '@/utils/url'
import type { TaskData } from '@/shared/types'
import { openFolder } from '@/service/preview.service'
import { createLogger } from '@/utils/logger'
import { useTranslate } from '@/hooks/useTranslate'
import { useTranslateStore } from '@/stores/translateStore'
import { useEditorStore } from '@/stores/editorStore'
import { useUIStore } from '@/stores/uiStore'
import { translateService } from '@/service/translate.service'
import { TranslationProgressBar } from '@/components/preview/TranslationProgressBar'
import { Toast } from '@douyinfe/semi-ui'

const logger = createLogger('ControlBar')

interface ControlBarProps {
  task: TaskData
  loading: boolean
  isHtmlParse?: boolean
  onBack?: () => void
  onOpenFolder?: (path: string) => void
}

export function ControlBar({ task, loading, onBack, onOpenFolder }: ControlBarProps) {
  const [copied, setCopied] = useState(false)
  const { startWindowTranslate, stopSession } = useTranslate()
  const sessionActive = useTranslateStore((s) => s.batch.sessionActive)
  const batchStatus = useTranslateStore((s) => s.batch.status)
  const batchDone = useTranslateStore((s) => s.batch.batchDone)
  const batchTotal = useTranslateStore((s) => s.batch.batchTotal)
  const coverageEdge = useTranslateStore((s) => s.batch.coverageEdge)
  const totalPages = useTranslateStore((s) => s.batch.totalPages)
  const currentPage = useEditorStore((s) => s.currentPage)
  const viewType = useUIStore((s) => s.viewType)

  /** 翻译全文按钮点击 */
  const handleTranslateAll = useCallback(async () => {
    if (sessionActive) {
      stopSession()
      return
    }
    if (!(await translateService.isConfigured())) {
      Toast.warning('请先在设置中配置翻译引擎')
      return
    }
    startWindowTranslate(currentPage)
  }, [sessionActive, stopSession, startWindowTranslate, currentPage])

  const translateButtonLabel = !sessionActive
    ? '翻译全文'
    : batchStatus === 'running'
      ? `翻译中 ${batchDone}/${batchTotal}`
      : batchStatus === 'prefetching'
        ? `预热中 ${coverageEdge}/${totalPages}页`
        : '翻译全文'

  const showTranslateButton = !loading && (task.state === 'unzipped' || task.state === 'done') && viewType === 'md'

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

  const handleOpenFolder = useCallback(async () => {
    logger.info(`Open folder for task: "${task.file_name}"`)
    if (onOpenFolder) {
      const folderName = genUniqFolderName(task)
      onOpenFolder(folderName)
    } else if (task.unzip_file_output_path) {
      await openFolder(task.unzip_file_output_path)
    }
  }, [task, onOpenFolder])

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between px-4 h-11 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 min-w-0">
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
          {showTranslateButton && (
            <button
              onClick={handleTranslateAll}
              className={`btn btn-sm${sessionActive ? ' btn-primary' : ''}`}
              title={sessionActive ? '停止翻译' : '翻译当前页及后续页面'}
            >
              {translateButtonLabel}
            </button>
          )}
          {!loading && (task.state === 'unzipped' || task.state === 'done') && (
            <button
              onClick={handleOpenFolder}
              className="btn btn-icon btn-ghost"
              title="打开文件夹"
            >
              📂
            </button>
          )}
        </div>
      </div>
      <TranslationProgressBar onStop={stopSession} />
    </div>
  )
}
