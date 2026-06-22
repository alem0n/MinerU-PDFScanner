// 迁移方案 A10 — JsonViewer：JSON 原始数据查看组件
// 用于 Preview 右侧面板 Tab 切换中的 "json" 视图，展示 TaskData 的原始 JSON 结构。
import { createLogger } from '@/utils/logger'

const logger = createLogger('JsonViewer')

interface JsonViewerProps {
  data: unknown
}

export function BuildJsonViewer({ data }: JsonViewerProps) {
  const str = JSON.stringify(data, null, 2)
  logger.info(`Rendering JSON: ${str.length} chars`)
  return (
    <pre className="text-xs whitespace-pre-wrap break-all bg-gray-50 p-3 rounded-lg">
      {str}
    </pre>
  )
}
