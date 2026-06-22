// 迁移方案 A11 — ChemViewer：化学数据查看组件
// 用于 Preview 右侧面板 Tab 切换中的 "chem" 视图，展示任务的化学结构数据。
import { createLogger } from '@/utils/logger'

const logger = createLogger('ChemViewer')

interface ChemViewerProps {
  chemData: unknown
  taskId: string
}

export function ChemViewer({ chemData, taskId }: ChemViewerProps) {
  if (!chemData) {
    logger.info(`No chem data for task "${taskId}"`)
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        暂无化学数据
      </div>
    )
  }
  return (
    <div className="p-4">
      <div className="text-sm text-gray-600 mb-2">化学数据预览</div>
      <pre className="text-xs whitespace-pre-wrap break-all bg-gray-50 p-3 rounded-lg max-h-96 overflow-auto">
        {JSON.stringify(chemData, null, 2)}
      </pre>
      <p className="text-xs text-gray-400 mt-2">Task ID: {taskId}</p>
    </div>
  )
}
