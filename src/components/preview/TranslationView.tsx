/**
 * 译文展示组件 (TranslationView)
 *
 * 位于每个 block 下方, 显示:
 *  - 全文翻译的块级译文 (按 blockId 从 store 取)
 *  - 右键选中翻译的译文列表 (一个块可多条)
 *
 * 布局: 内联在 BlockItem 行内 (flex-col), 不脱离文档流, 避免重叠。
 * 译文插入后虚拟器 measureElement 自动重测行高。
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
  const selectionTranslations = useTranslateStore((s) => s.selectionTranslations[blockId])
  const setBlockResult = useTranslateStore((s) => s.setBlockResult)
  const setBlockStatus = useTranslateStore((s) => s.setBlockStatus)
  const removeBlockTranslation = useTranslateStore((s) => s.removeBlockTranslation)
  const setSelectionStatus = useTranslateStore((s) => s.setSelectionStatus)
  const removeSelectionTranslation = useTranslateStore((s) => s.removeSelectionTranslation)

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

  /** 重试选中翻译 */
  const retrySelection = useCallback(
    async (index: number) => {
      const item = selectionTranslations?.[index]
      if (!item) return
      setSelectionStatus(blockId, index, 'requesting')
      try {
        const results = await translateService.translate([item.source])
        if (results.length > 0) {
          setSelectionStatus(blockId, index, 'done')
          // 更新译文内容 (通过 addSelectionResult 覆盖不太合适, 用 setSelectionStatus + 直接改)
          // 这里用 setBlockResult 的模式不匹配, 用 store 的 setSelectionStatus 即可
          // 但需要更新 target — 通过 setSelectionStatus 不改 target, 需要另一种方式
          // 简化: 直接用 store 的 addSelectionResult 替换 — 不, 那会追加
          // 最好在 store 加一个 updateSelectionResult action
          // 临时方案: removeSelectionTranslation + addSelectionResult
          removeSelectionTranslation(blockId, index)
          useTranslateStore.getState().addSelectionResult(blockId, {
            source: item.source,
            target: results[0].text,
            status: 'done',
          })
        }
      } catch (err: any) {
        const msg = err instanceof TranslateError ? err.message : err?.message || '翻译失败'
        setSelectionStatus(blockId, index, 'error', msg)
        logger.warn(`retry selection failed: ${msg}`)
      }
    },
    [blockId, selectionTranslations, setSelectionStatus, removeSelectionTranslation],
  )

  // 无任何译文时不渲染
  if (!blockTranslation && (!selectionTranslations || selectionTranslations.length === 0)) {
    return null
  }

  // 检测原文是否变更
  const isStale = blockTranslation && currentSourceText && blockTranslation.source !== currentSourceText

  return (
    <div className="translation-view" onClick={(e) => e.stopPropagation()}>
      {/* 块级译文 (全文翻译) */}
      {blockTranslation && blockTranslation.status !== 'skipped' && blockTranslation.status !== 'cancelled' && (
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

      {/* 选中翻译列表 (右键翻译) */}
      {selectionTranslations?.map((item, index) => (
        <TranslationCard
          key={`${blockId}-sel-${index}`}
          target={item.target}
          status={item.status}
          error={item.error}
          theme={theme}
          onRetry={() => retrySelection(index)}
          onRemove={() => removeSelectionTranslation(blockId, index)}
        />
      ))}
    </div>
  )
})
