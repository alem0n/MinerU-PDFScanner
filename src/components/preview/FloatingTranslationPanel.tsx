/**
 * FloatingTranslationPanel — 浮动译文面板 (跟随右键光标, 单条替换)
 *
 * 当用户选中文字后右键"翻译", 译文以 fixed 面板形式显示在光标附近。
 * 同一时刻仅一条, 新的右键翻译会替换旧的 (store 字段 floatingTranslation: FloatingTranslation | null)。
 *
 * 定位: 跟随右键坐标 (x, y), 边界检测防止溢出视口右侧/底部。
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/preview/MarkdownRenderer'
import { useTranslateStore } from '@/stores/translateStore'
import { useTranslate } from '@/hooks/useTranslate'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'

interface FloatingTranslationPanelProps {
  theme?: MarkdownTheme
}

export const FloatingTranslationPanel = memo(function FloatingTranslationPanel({
  theme,
}: FloatingTranslationPanelProps) {
  const floating = useTranslateStore((s) => s.floatingTranslation)
  const clearFloating = useTranslateStore((s) => s.clearFloating)
  const { retryFloating } = useTranslate()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  /** 根据右键坐标 + 面板尺寸做边界检测 */
  useLayoutEffect(() => {
    if (!floating) return
    const el = panelRef.current
    const w = el?.offsetWidth ?? 280
    const h = el?.offsetHeight ?? 80
    const margin = 8
    let left = floating.x + 12
    let top = floating.y + 12
    if (left + w + margin > window.innerWidth) left = Math.max(margin, floating.x - w - 12)
    if (top + h + margin > window.innerHeight) top = Math.max(margin, floating.y - h - 12)
    setPos({ left, top })
  }, [floating])

  /** Escape 关闭 */
  useEffect(() => {
    if (!floating) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearFloating() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [floating, clearFloating])

  if (!floating || floating.status === 'skipped' || floating.status === 'cancelled') return null

  const isError = floating.status === 'error'

  return (
    <div
      ref={panelRef}
      className={`floating-translation-panel${isError ? ' error' : ''}`}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ftp-header">
        <span className="ftp-status">
          {floating.status === 'requesting' && '翻译中…'}
          {floating.status === 'done' && '译文'}
          {floating.status === 'error' && '翻译失败'}
        </span>
        <div className="ftp-actions">
          {floating.status === 'done' && (
            <button
              className="ftp-btn"
              title="复制译文"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(floating.target).catch(() => {})
              }}
            >
              复制
            </button>
          )}
          {isError && (
            <button
              className="ftp-btn"
              title="重试"
              onClick={(e) => { e.stopPropagation(); retryFloating() }}
            >
              重试
            </button>
          )}
          <button
            className="ftp-btn"
            title="关闭"
            onClick={(e) => { e.stopPropagation(); clearFloating() }}
          >
            ✕
          </button>
        </div>
      </div>

      {floating.status === 'requesting' && (
        <div className="ftp-body" style={{ color: '#888' }}>
          <span className="ftp-spinner" />
          <span style={{ fontSize: 12 }}>正在翻译…</span>
        </div>
      )}

      {floating.status === 'done' && floating.target && (
        <div className="ftp-body">
          <MarkdownRenderer content={floating.target} theme={theme} hideCopyButton />
        </div>
      )}

      {isError && (
        <div className="ftp-body" style={{ color: '#dc2626', fontSize: 12 }}>
          {floating.error || '未知错误'}
        </div>
      )}
    </div>
  )
})
