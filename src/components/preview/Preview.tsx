import { useState } from 'react'
import { ControlBar } from '@/components/preview/ControlBar'
import { SplitPane } from '@/components/preview/SplitPane'
import { MarkdownRenderer } from '@/components/preview/MarkdownRenderer'
import { PdfPanel } from '@/components/preview/PdfViewer'
import type { TaskData, BlockData, MergeConnection } from '@/shared/types'
import { TASK_PROCESSING_STATES, ExportFormat } from '@/shared/types'
import { createLogger } from '@/utils/logger'

const logger = createLogger('Preview')

export interface PreviewPageProps {
  task: TaskData | null
  blockData: BlockData[][] | null
  mergeConnections: MergeConnection[]
  loading: boolean
  error: string | null
  onRetry?: () => void
  onBack?: () => void
  onFavorite?: () => void
  onOpenFolder?: (path: string) => void
  onExport?: (format: ExportFormat) => void
  pdfUrl?: string
}

export function PreviewPage({
  task,
  blockData,
  mergeConnections,
  loading,
  error,
  onRetry,
  onBack,
  onFavorite,
  onOpenFolder,
  onExport,
  pdfUrl,
}: PreviewPageProps) {
  const [showPdfOverlay, setShowPdfOverlay] = useState(true)

  if (loading) {
    logger.info(`Loading task detail`)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-2 text-sm text-gray-400">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !task) {
    logger.error(`Task load failed: error="${error}"`)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500">加载失败</p>
          <p className="text-sm text-gray-400 mt-1">
            {error || '未知错误'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn btn-primary mt-3"
            >
              重试
            </button>
          )}
        </div>
      </div>
    )
  }

  logger.info(`Task loaded: id="${task.task_id}", state="${task.state}", file="${task.file_name}"`)
  const isProcessing = TASK_PROCESSING_STATES.includes(task.state as any)
  const isFailed = ['failed', 'download-failed', 'unzip-failed', 'aborted'].includes(task.state)

  if (isProcessing) {
    return (
      <div className="flex flex-col h-full">
        <ControlBar task={task} loading={true} onBack={onBack} onFavorite={onFavorite} onOpenFolder={onOpenFolder} onExport={onExport} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto">
              <div className="animate-spin w-16 h-16 border-3 border-blue-200 border-t-blue-600 rounded-full" />
            </div>
            <p className="mt-3 text-base text-gray-700 font-medium">正在处理中...</p>
            <p className="text-sm text-gray-400 mt-1">
              状态: {task.state} · {task.file_name}
            </p>
            <div className="mt-4 w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden mx-auto">
              <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="flex flex-col h-full">
        <ControlBar task={task} loading={false} onBack={onBack} onFavorite={onFavorite} onOpenFolder={onOpenFolder} onExport={onExport} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 text-lg font-medium">处理失败</p>
            <p className="text-sm text-gray-400 mt-1">{task.err_msg || '未知错误'}</p>
            <p className="text-xs text-gray-300 mt-1">错误码: {task.err_code || '-'}</p>
            {task.can_retry && onRetry && (
              <button
                onClick={onRetry}
                className="btn btn-primary mt-4"
              >
                重新处理
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ControlBar task={task} loading={false} onBack={onBack} onFavorite={onFavorite} onOpenFolder={onOpenFolder} onExport={onExport} />
      <SplitPane
        left={<PdfPanel
          task={task}
          type={task.type || 'PDF'}
          blockData={blockData}
          showOverlay={showPdfOverlay}
          onToggleShowLayout={() => setShowPdfOverlay(!showPdfOverlay)}
          mergeConnections={mergeConnections}
          outputPath={task.unzip_file_output_path}
          pdfUrl={pdfUrl}
        />}
        right={<RightPanel
          task={task}
          outputPath={task.unzip_file_output_path}
        />}
        defaultLeftWidth={50}
      />
    </div>
  )
}

function RightPanel({
  task,
  outputPath,
}: {
  task: TaskData
  outputPath: string
}) {
  const resolvedPath = outputPath || task.unzip_file_output_path

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        {resolvedPath ? (
          <MarkdownRenderer outputPath={resolvedPath} theme="base" imageBasePath={resolvedPath} />
        ) : (
          <p className="text-sm text-gray-400">缺少输出路径</p>
        )}
      </div>
    </div>
  )
}
