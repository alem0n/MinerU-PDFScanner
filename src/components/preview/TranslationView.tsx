/**
 * 译文展示组件 (TranslationView)
 *
 * 位于每个 block 下方, 显示块级译文 (按 blockId 从 store 取)。
 * 块级译文来源:
 *  - 全文翻译 (translatePageRange 写入 blockTranslations)
 *  - 手动块翻译 (无选中右键 → translateBlock 写入 blockTranslations, 与全文翻译共用缓存)
 * 全文翻译时, 已有 done 译文且原文未变的块会自动缓存命中跳过 (translatePageRange:186-191)。
 *
 * 右键选中翻译已移至 FloatingTranslationPanel (浮动面板, 单条替换, 跟随光标)。
 * 布局: 内联在 BlockItem 行内 (flex-col), 不脱离文档流, 避免重叠。
 * 连续 DOM 树方案下自然流自动计算行高, 无需 measureElement。
 */
import { memo, useCallback } from 'react'
import { MarkdownRenderer } from '@/components/preview/MarkdownRenderer'
import { useTranslateStore } from '@/stores/translateStore'
import { translateService } from '@/service/translate.service'
import { TranslateError } from '@/translate'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'
import { createLogger } from '@/utils/logger'

const logger = createLogger('TranslationView')

interface TranslationViewProps {
  blockId: string
  blockPosition?: string
  /** 当前块原文 (用于检测原文是否变更) */
  currentSourceText?: string
  theme?: MarkdownTheme
}

/** 单条译文卡片 */
function TranslationCard({
  target,
  status,
  error,
  stale,
  theme,
  onRetry,
  onRemove,
}: {
  target: string
  status: string
  error?: string
  stale?: boolean
  theme?: MarkdownTheme
  onRetry: () => void
  onRemove: () => void
}) {
  if (status === 'skipped' || status === 'cancelled') return null

  return (
    <div
      className="translation-card"
      style={{
        marginTop: 6,
        padding: '8px 10px',
        borderRadius: 6,
        background: status === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.05)',
        borderLeft: `3px solid ${status === 'error' ? '#ef4444' : '#3b82f6'}`,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {/* 状态栏 */}
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span className="text-xs" style={{ color: '#666' }}>
          {status === 'requesting' && '翻译中…'}
          {status === 'done' && (stale ? '译文 (原文已修改)' : '译文')}
          {status === 'error' && '翻译失败'}
        </span>
        <div className="flex items-center gap-1">
          {status === 'done' && (
            <button
              className="btn btn-text-muted btn-sm"
              style={{ fontSize: 11, padding: '0 4px' }}
              title="复制译文"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(target).catch(() => {})
              }}
            >
              复制
            </button>
          )}
          {status === 'error' && (
            <button
              className="btn btn-text-muted btn-sm"
              style={{ fontSize: 11, padding: '0 4px' }}
              title="重试"
              onClick={(e) => {
                e.stopPropagation()
                onRetry()
              }}
            >
              重试
            </button>
          )}
          <button
            className="btn btn-text-muted btn-sm"
            style={{ fontSize: 11, padding: '0 4px' }}
            title="移除译文"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 请求中 */}
      {status === 'requesting' && (
        <div className="flex items-center gap-2" style={{ color: '#888' }}>
          <div className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-xs">正在翻译…</span>
        </div>
      )}

      {/* 成功 */}
      {status === 'done' && target && (
        <div className="translation-text prose-sm" onClick={(e) => e.stopPropagation()}>
          <MarkdownRenderer content={target} theme={theme} hideCopyButton />
        </div>
      )}

      {/* 失败 */}
      {status === 'error' && (
        <div className="text-xs" style={{ color: '#dc2626' }}>
          {error || '未知错误'}
        </div>
      )}
    </div>
  )
}

export const TranslationView = memo(function TranslationView({
  blockId,
  blockPosition,
  currentSourceText,
  theme,
}: TranslationViewProps) {
  const blockTranslation = useTranslateStore((s) => s.blockTranslations[blockId])
  const setBlockResult = useTranslateStore((s) => s.setBlockResult)
  const setBlockStatus = useTranslateStore((s) => s.setBlockStatus)
  const removeBlockTranslation = useTranslateStore((s) => s.removeBlockTranslation)

  /** 重试块翻译 */
  const retryBlock = useCallback(async () => {
    if (!blockTranslation) return
    setBlockStatus(blockId, 'requesting')
    try {
      const results = await translateService.translate([blockTranslation.source])
      if (results.length > 0) {
        setBlockResult(blockId, {
          blockPosition,
          source: blockTranslation.source,
          target: results[0].text,
          status: 'done',
        })
      }
    } catch (err: any) {
      const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
      setBlockStatus(blockId, 'error', msg)
      logger.warn(`retry block failed: ${msg}`)
    }
  }, [blockId, blockPosition, blockTranslation, setBlockResult, setBlockStatus])

  // 无块级译文时不渲染 (选中译文已移至 FloatingTranslationPanel)
  if (!blockTranslation) {
    return null
  }

  // 检测原文是否变更
  const isStale = blockTranslation && currentSourceText && blockTranslation.source !== currentSourceText

  return (
    <div className="translation-view" onClick={(e) => e.stopPropagation()}>
      {/* 块级译文 (全文翻译 / 手动块翻译, 共用 blockTranslations 缓存) */}
      {blockTranslation.status !== 'skipped' && blockTranslation.status !== 'cancelled' && (
        <TranslationCard
          target={blockTranslation.target}
          status={blockTranslation.status}
          error={blockTranslation.error}
          stale={!!isStale}
          theme={theme}
          onRetry={retryBlock}
          onRemove={() => removeBlockTranslation(blockId)}
        />
      )}
    </div>
  )
})
