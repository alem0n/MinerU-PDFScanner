import { useEffect, useCallback } from 'react'
import type { BlockData } from '@/shared/types'
import type { MarkdownTheme } from '@/hooks/useMarkdownTheme'
import { MarkdownBlockView } from '@/components/preview/MarkdownBlockView'
import { FloatingTranslationPanel } from '@/components/preview/FloatingTranslationPanel'
import { UnifiedEditLayer } from '@/components/preview/UnifiedEditLayer'
import { useEditorStore } from '@/stores/editorStore'
import { saveBlockEdit, getBlockListPath } from '@/service/preview.service'
import { createLogger } from '@/utils/logger'

const logger = createLogger('MainMarkdownViewer')

interface MainMarkdownViewerProps {
  blockData: BlockData[][] | null
  theme: MarkdownTheme
  imageBasePath: string
  showTypeLabel?: boolean
}

export function MainMarkdownViewer({ blockData, theme, imageBasePath, showTypeLabel = true }: MainMarkdownViewerProps) {
  const setLayerData = useEditorStore((s) => s.setLayerData)
  const updateBlockContent = useEditorStore((s) => s.updateBlockContent)
  const markEdited = useEditorStore((s) => s.markEdited)
  const clearEditInfo = useEditorStore((s) => s.clearEditInfo)

  useEffect(() => {
    if (blockData) setLayerData(blockData)
  }, [blockData, setLayerData])

  const handleSave = useCallback(async (blockPosition: string, content: string) => {
    logger.info(`MainMarkdownViewer save: position="${blockPosition}"`)
    updateBlockContent(blockPosition, content)
    markEdited(blockPosition)
    try {
      const blockListPath = await getBlockListPath(imageBasePath.replace(/\\/g, '/'))
      const result = await saveBlockEdit(blockListPath, blockPosition, content)
      if (result.success) logger.info(`Saved to block_list.json`)
      else logger.warn(`Save failed: ${result.error}`)
    } catch (err) { logger.error(`saveBlockEdit error:`, err) }
    clearEditInfo()
  }, [imageBasePath, updateBlockContent, markEdited, clearEditInfo])

  const handleCancel = useCallback(() => { clearEditInfo() }, [clearEditInfo])

  if (!blockData || blockData.length === 0) return <p className="text-sm text-gray-400">暂无块数据</p>

  return (
    <div className="main-markdown-viewer" style={{ height: '100%', overflow: 'hidden' }}>
      <MarkdownBlockView blockData={blockData} theme={theme} imageBasePath={imageBasePath} showTypeLabel={showTypeLabel} />
      <UnifiedEditLayer onSave={handleSave} onCancel={handleCancel} />
      <FloatingTranslationPanel theme={theme} />
    </div>
  )
}
