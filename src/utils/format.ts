import * as dayjs from 'dayjs'
import type { ExtractProgress } from '@/shared/types'

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

export function formatDate(timestamp: string | number): string {
  if (!timestamp) return ''
  const d = dayjs(typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp)
  if (!d.isValid()) return String(timestamp)
  const now = dayjs()
  const diffMs = now.diff(d, 'millisecond')
  if (diffMs < 0) return d.format('YYYY-MM-DD HH:mm')
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}小时前`
  if (diffMinutes < 43200) return `${Math.floor(diffMinutes / 1440)}天前`
  return d.format('YYYY-MM-DD HH:mm')
}

export function parseExtractProgress(progress: string): ExtractProgress | null {
  try { return JSON.parse(progress) } catch { return null }
}

export function formatProgress(progress: string): number {
  const p = parseExtractProgress(progress)
  if (!p || !p.total_pages) return 0
  return Math.round((p.extracted_pages / p.total_pages) * 100)
}

export function isTaskProcessing(state: string): boolean {
  return ['loading', 'pending', 'running', 'downloading', 'unzipping', 'waiting_file', 'waiting_download', 'uploading'].includes(state)
}

export function isTaskDone(state: string): boolean {
  return state === 'unzipped'
}

export function isTaskFailed(state: string): boolean {
  return state === 'failed' || state === 'download-failed' || state === 'unzip-failed' || state === 'aborted'
}

export function genUniqFolderFileName(item: { file_name: string; data_id: string }): string {
  return `${item.file_name}-${item.data_id}`
}
