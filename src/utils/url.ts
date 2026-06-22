import type { TaskData } from '@/shared/types'
import { ExportFormat } from '@/shared/types'

interface ViewerUrlOptions {
  path: string
  filter?: Record<string, string>
  taskId?: string
  type?: string
}

export function buildViewerUrl({ path, filter = {}, taskId, type }: ViewerUrlOptions): string {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([k, v]) => {
    if (v != null && v !== '') params.append(k, String(v))
  })
  params.delete('task_id')
  if (taskId) params.append('task_id', taskId)

  const fileType = (type || '').toLowerCase()
  const isUnknown = fileType === 'unknown' || !fileType
  const isOffice = ['doc', 'xls', 'ppt', 'office'].includes(fileType)
  const viewerType = isUnknown ? 'html' : isOffice ? 'office' : 'PDF'

  const qs = params.toString()
  return `/${viewerType}/${encodeURIComponent(path)}${qs ? `?${qs}` : ''}`
}

export function buildWebViewerUrl(taskId: string, type?: string): string {
  const fileType = (type || '').toLowerCase()
  const isUnknown = fileType === 'unknown' || !fileType
  const isOffice = ['doc', 'xls', 'ppt', 'office'].includes(fileType)
  const viewerType = isUnknown ? 'html' : isOffice ? 'office' : 'PDF'
  return `/${viewerType}/${encodeURIComponent(taskId)}`
}

export async function buildTaskViewerUrl(task: TaskData): Promise<string> {
  return buildWebViewerUrl(task.task_id || task.data_id, task.type)
}

export function genUniqFolderName(item: { file_name: string; data_id: string }): string {
  return `${item.file_name}-${item.data_id}`
}

export function getExportFileName(task: TaskData, format: ExportFormat): string {
  const ext = format === ExportFormat.JSON ? 'layout.json' : `full.${format}`
  return `${task.file_name}_${task.data_id}_${ext}`
}
