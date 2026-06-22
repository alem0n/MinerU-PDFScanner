import { useState, useEffect } from 'react'
import { ControlBar } from '@/components/preview/ControlBar'
import { SplitPane } from '@/components/preview/SplitPane'
import { MainMarkdownViewer } from '@/components/preview/MainMarkdownViewer'
import { MarkdownRenderer } from '@/components/preview/MarkdownRenderer'
import { BuildJsonViewer } from '@/components/preview/JsonViewer'
import { ChemViewer } from '@/components/preview/ChemViewer'
import { PdfPanel } from '@/components/preview/PdfViewer'
import { useUIStore, type PreviewViewType } from '@/stores/uiStore'
import { useTranslateStore } from '@/stores/translateStore'
import type { TaskData, BlockData, MergeConnection } from '@/shared/types'
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
  onOpenFolder?: (path: string) => void
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
  onOpenFolder,
  pdfUrl,
}: PreviewPageProps) {
  const { theme } = useMarkdownTheme()
  const [showPdfOverlay, setShowPdfOverlay] = useState(true)
  const clearAllTranslations = useTranslateStore((s) => s.clearAll)

  /** 切换任务/路由时清空翻译状态, 避免跨任务污染 */
  useEffect(() => {
    return () => {
      clearAllTranslations()
    }
  }, [clearAllTranslations])

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
        <ControlBar task={task} loading={true} onBack={onBack} onOpenFolder={onOpenFolder} />
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
        <ControlBar task={task} loading={false} onBack={onBack} onOpenFolder={onOpenFolder} />
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
      <ControlBar task={task} loading={false} onBack={onBack} onOpenFolder={onOpenFolder} />
      <SplitPane
        left={<PdfPanel task={task} type={task.type || 'PDF'} blockData={blockData} showOverlay={showPdfOverlay}
          onToggleShowLayout={() => setShowPdfOverlay(!showPdfOverlay)} mergeConnections={mergeConnections}
          outputPath={task.unzip_file_output_path} pdfUrl={pdfUrl} />}
        right={<RightPanel task={task} blockData={blockData} outputPath={task.unzip_file_output_path} theme={theme} />}
        defaultLeftWidth={50}
      />
    </div>
  )
}

// 迁移方案 A1 — RightPanel：Markdown 面板 Tab 切换（md/json/chem）+ 块视图/纯 Markdown 切换
// 对应迁移方案 6.3 验收项："Markdown 面板 Tab 切换（md/json/chem）正常"
function RightPanel({ task, blockData, outputPath, theme }: {
  task: TaskData
  blockData: BlockData[][] | null
  outputPath: string
  theme: import('@/hooks/useMarkdownTheme').MarkdownTheme
}) {
  // 迁移方案 B1 — 从 uiStore 读取 Tab 视图类型与 showLayout 开关
  const viewType = useUIStore((s) => s.viewType)
  const setViewType = useUIStore((s) => s.setViewType)
  const showLayout = useUIStore((s) => s.showLayout)
  const setShowLayout = useUIStore((s) => s.setShowLayout)

  const resolvedPath = outputPath || task.unzip_file_output_path || ''

  // 迁移方案 A1 — 三个 Tab：Markdown / JSON / 化学
  const tabs: { key: PreviewViewType; label: string }[] = [
    { key: 'md', label: 'Markdown' },
    { key: 'json', label: 'JSON' },
    { key: 'chem', label: '化学' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="tabs-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewType(tab.key)}
            className={`tab-item${viewType === tab.key ? ' active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
        {/* 迁移方案 A1 — showLayout 切换：仅在 md Tab 下显示，切换块视图(MainMarkdownViewer)与纯 Markdown(MarkdownRenderer) */}
        {viewType === 'md' && (
          <button
            onClick={() => setShowLayout(!showLayout)}
            className="btn btn-sm btn-ghost ml-2"
            title={showLayout ? '切换为纯 Markdown' : '切换为块视图'}
          >
            {showLayout ? '纯 Markdown' : '块视图'}
          </button>
        )}
        <div className="flex-1" />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {/* 迁移方案 A1 — md Tab：showLayout=true 显示块视图，false 显示纯 Markdown 渲染 */}
        {viewType === 'md' && resolvedPath && (
          showLayout
            ? <MainMarkdownViewer blockData={blockData} theme={theme} imageBasePath={resolvedPath} />
            : <MarkdownRenderer outputPath={resolvedPath} theme={theme} imageBasePath={resolvedPath} />
        )}
        {viewType === 'md' && !resolvedPath && (
          <p className="text-sm text-gray-400">缺少输出路径</p>
        )}
        {/* 迁移方案 A10 — json Tab：展示任务原始 JSON 数据 */}
        {viewType === 'json' && (
          <BuildJsonViewer data={task} />
        )}
        {/* 迁移方案 A11 — chem Tab：展示化学数据 */}
        {viewType === 'chem' && (
          <ChemViewer chemData={(task as any).chem} taskId={task.task_id} />
        )}
      </div>
    </div>
  )
}
