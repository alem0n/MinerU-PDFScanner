/**
 * 翻译进度条 (TranslationProgressBar)
 *
 * 全文翻译运行时显示在预览面板顶部:
 *  上行: 本批进度 X / Y (百分比条)
 *  下行: 已覆盖 Z 页 / 共 N 页 + 失败数 + 停止按钮
 */
import { memo } from 'react'
import { useTranslateStore } from '@/stores/translateStore'

interface TranslationProgressBarProps {
  onStop: () => void
}

export const TranslationProgressBar = memo(function TranslationProgressBar({ onStop }: TranslationProgressBarProps) {
  const batch = useTranslateStore((s) => s.batch)
  const { status, batchTotal, batchDone, batchFailed, coverageEdge, totalPages, sessionActive } = batch

  if (!sessionActive) return null

  const percent = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0
  const pagePercent = totalPages > 0 ? Math.round((coverageEdge / totalPages) * 100) : 0
  const statusLabel =
    status === 'running' ? '翻译中' :
    status === 'prefetching' ? '预热中' :
    status === 'stopped' ? '已停止' :
    status === 'cancelled' ? '已取消' : ''

  return (
    <div
      className="translation-progress-bar"
      style={{
        padding: '6px 12px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontSize: 12,
      }}
    >
      {/* 上行: 本批进度 */}
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ color: '#64748b', minWidth: 48 }}>{statusLabel}</span>
        <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: '#3b82f6',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span style={{ color: '#64748b', minWidth: 60, textAlign: 'right' }}>
          {batchDone} / {batchTotal}
        </span>
      </div>

      {/* 下行: 页覆盖 + 失败 + 停止 */}
      <div className="flex items-center gap-2">
        <span style={{ color: '#64748b' }}>
          已覆盖 {coverageEdge} / {totalPages} 页
        </span>
        {batchFailed > 0 && (
          <span style={{ color: '#dc2626' }}>失败 {batchFailed}</span>
        )}
        <div style={{ flex: 1, height: 3, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pagePercent}%`,
              height: '100%',
              background: '#10b981',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        {status !== 'stopped' && status !== 'cancelled' && (
          <button
            className="btn btn-text-muted btn-sm"
            style={{ fontSize: 11, padding: '0 8px' }}
            title="停止翻译"
            onClick={onStop}
          >
            停止
          </button>
        )}
      </div>
    </div>
  )
})
