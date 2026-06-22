import { useState } from 'react'
import { ControlBar } from '@/components/preview/ControlBar'
import { SplitPane } from '@/components/preview/SplitPane'
import { MainMarkdownViewer } from '@/components/preview/MainMarkdownViewer'
import { PdfPanel } from '@/components/preview/PdfViewer'
import type { TaskData, BlockData, MergeConnection, ExportFormat } from '@/shared/types'
import { TASK_PROCESSING_STATES } from '@/shared/types'
import { useMarkdownTheme } from '@/hooks/useMarkdownTheme'

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
  const { theme } = useMarkdownTheme()
  const [showPdfOverlay, setShowPdfOverlay] = useState(true)

  if (loading) {
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
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500">加载失败</p>
          <p className="text-sm text-gray-400 mt-1">{error || '未知错误'}</p>
          {onRetry && <button onClick={onRetry} className="btn btn-primary mt-3">重试</button>}
        </div>
      </div>
    )
  }

  const isProcessing = TASK_PROCESSING_STATES.includes(task.state as any)
  const isFailed = ['failed', 'download-failed', 'unzip-failed', 'aborted'].includes(task.state)

  if (isProcessing) {
    return (
      <div className="flex flex-col h-full">
        <ControlBar task={task} loading={true} onBack={onBack} onFavorite={onFavorite} onOpenFolder={onOpenFolder} onExport={onExport} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-16 h-16 border-3 border-blue-200 border-t-blue-600 rounded-full mx-auto" />
            <p className="mt-3 text-base text-gray-700 font-medium">正在处理中...</p>
            <p className="text-sm text-gray-400 mt-1">状态: {task.state} · {task.file_name}</p>
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
            {task.can_retry && onRetry && <button onClick={onRetry} className="btn btn-primary mt-4">重新处理</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ControlBar task={task} loading={false} onBack={onBack} onFavorite={onFavorite} onOpenFolder={onOpenFolder} onExport={onExport} />
      <SplitPane
        left={<PdfPanel task={task} type={task.type || 'PDF'} blockData={blockData} showOverlay={showPdfOverlay}
          onToggleShowLayout={() => setShowPdfOverlay(!showPdfOverlay)} mergeConnections={mergeConnections}
          outputPath={task.unzip_file_output_path} pdfUrl={pdfUrl} />}
        right={<RightPanel blockData={blockData} outputPath={task.unzip_file_output_path} theme={theme} />}
        defaultLeftWidth={50}
      />
    </div>
  )
}

function RightPanel({ blockData, outputPath, theme }: {
  blockData: BlockData[][] | null
  outputPath: string
  theme: import('@/hooks/useMarkdownTheme').MarkdownTheme
}) {
  const resolvedPath = outputPath || ''
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {blockData && blockData.length > 0 ? (
          <MainMarkdownViewer blockData={blockData} theme={theme} imageBasePath={resolvedPath} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">暂无块数据</div>
        )}
      </div>
    </div>
  )
}
