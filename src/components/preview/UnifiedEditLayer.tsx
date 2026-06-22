import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { createLogger } from '@/utils/logger'

const logger = createLogger('UnifiedEditLayer')

interface UnifiedEditLayerProps {
  onSave: (blockPosition: string, content: string) => void
  onCancel: () => void
}

export const UnifiedEditLayer = memo(function UnifiedEditLayer({ onSave, onCancel }: UnifiedEditLayerProps) {
  const editInfo = useEditorStore((s) => s.editInfo)
  if (!editInfo) return null
  const isFormula = editInfo.type === 'equation' || editInfo.type === 'interline_equation'
  const isTable = editInfo.type === 'table'
  if (isFormula) return <FormulaEditContent editInfo={editInfo} onSave={onSave} onCancel={onCancel} />
  if (isTable) return <TableEditContent editInfo={editInfo} onSave={onSave} onCancel={onCancel} />
  return <TextEditContent editInfo={editInfo} onSave={onSave} onCancel={onCancel} />
})

type EditInfoType = NonNullable<ReturnType<typeof useEditorStore.getState>['editInfo']>

function TextEditContent({ editInfo, onSave, onCancel }: { editInfo: EditInfoType; onSave: (bp: string, c: string) => void; onCancel: () => void }) {
  const contentKey = `${editInfo.id}::${editInfo.content}::${editInfo.type}`
  const [text, setText] = useState(editInfo.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setText(editInfo.content); queueMicrotask(() => { textareaRef.current?.focus(); textareaRef.current?.select() }) }, [contentKey])
  const handleSave = useCallback(() => { logger.info(`TextEditLayer save: "${editInfo.id}"`); onSave(editInfo.id, text) }, [editInfo.id, text, onSave])
  const handleCancel = useCallback(() => { onCancel() }, [onCancel])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave() }, [handleCancel, handleSave])
  return (
    <div className="edit-layer-overlay">
      <div className="edit-layer-content">
        <div className="edit-layer-header">
          <span className="edit-layer-type-badge" data-blocktype={editInfo.type}>{editInfo.type}</span>
          <span className="edit-layer-position">{editInfo.id}</span>
        </div>
        <textarea ref={textareaRef} className="edit-layer-textarea" value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} rows={Math.max(3, text.split('\n').length + 2)} />
        <div className="edit-layer-actions">
          <span className="edit-layer-hint">Ctrl+Enter 保存 · Esc 取消</span>
          <div className="edit-layer-buttons">
            <button className="edit-btn edit-btn-cancel" onClick={handleCancel}>取消</button>
            <button className="edit-btn edit-btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormulaEditContent({ editInfo, onSave, onCancel }: { editInfo: EditInfoType; onSave: (bp: string, c: string) => void; onCancel: () => void }) {
  const contentKey = `${editInfo.id}::${editInfo.content}`
  const [latex, setLatex] = useState(editInfo.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setLatex(editInfo.content); queueMicrotask(() => textareaRef.current?.focus()) }, [contentKey])
  const handleSave = useCallback(() => { onSave(editInfo.id, latex) }, [editInfo.id, latex, onSave])
  const handleCancel = useCallback(() => { onCancel() }, [onCancel])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave() }, [handleCancel, handleSave])
  return (
    <div className="edit-layer-overlay formula-edit-layer">
      <div className="edit-layer-content formula-edit-content">
        <div className="edit-layer-header">
          <span className="edit-layer-type-badge" data-blocktype="equation">公式</span>
          <span className="edit-layer-position">{editInfo.id}</span>
        </div>
        <div className="formula-edit-body">
          <div className="formula-edit-input">
            <label className="formula-edit-label">LaTeX 源码</label>
            <textarea ref={textareaRef} className="edit-layer-textarea formula-textarea" value={latex} onChange={e => setLatex(e.target.value)} onKeyDown={handleKeyDown} rows={6} placeholder="输入 LaTeX 公式，例如: E = mc^2" />
          </div>
          <div className="formula-edit-preview">
            <label className="formula-edit-label">实时预览</label>
            <div className="formula-preview-box"><span className="text-sm text-gray-400">公式预览将在保存后刷新</span></div>
          </div>
        </div>
        <div className="edit-layer-actions">
          <span className="edit-layer-hint">Ctrl+Enter 保存 · Esc 取消</span>
          <div className="edit-layer-buttons">
            <button className="edit-btn edit-btn-cancel" onClick={handleCancel}>取消</button>
            <button className="edit-btn edit-btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function mdTableToMatrix(text: string): string[][] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  return lines.filter(l => l.includes('|')).map(line => line.split('|').map(c => c.trim()).filter(c => c !== ''))
}
function matrixToMdTable(matrix: string[][]): string {
  if (matrix.length === 0) return ''
  const colCount = Math.max(...matrix.map(r => r.length))
  const rows = matrix.map(r => { while (r.length < colCount) r.push(''); return r })
  const header = rows[0]; const separator = header.map(() => '---'); const body = rows.slice(1)
  const lines: string[] = []
  lines.push('| ' + header.join(' | ') + ' |')
  lines.push('| ' + separator.join(' | ') + ' |')
  body.forEach(row => { lines.push('| ' + row.join(' | ') + ' |') })
  return lines.join('\n')
}

function TableEditContent({ editInfo, onSave, onCancel }: { editInfo: EditInfoType; onSave: (bp: string, c: string) => void; onCancel: () => void }) {
  const contentKey = `${editInfo.id}::${editInfo.content}`
  const [matrix, setMatrix] = useState<string[][]>(() => mdTableToMatrix(editInfo.content))
  const [rawText, setRawText] = useState(editInfo.content)
  useEffect(() => { const m = mdTableToMatrix(editInfo.content); setMatrix(m); setRawText(editInfo.content) }, [contentKey])
  const handleCellChange = useCallback((row: number, col: number, value: string) => { setMatrix(prev => { const next = prev.map(r => [...r]); if (!next[row]) next[row] = []; next[row][col] = value; return next }) }, [])
  const handleAddRow = useCallback(() => { setMatrix(prev => { const colCount = prev.length > 0 ? prev[0].length : 1; return [...prev, new Array(colCount).fill('')] }) }, [])
  const handleRemoveRow = useCallback(() => { setMatrix(prev => prev.length <= 1 ? prev : prev.slice(0, -1)) }, [])
  const handleSave = useCallback(() => { onSave(editInfo.id, matrixToMdTable(matrix)) }, [editInfo.id, matrix, onSave])
  const handleSaveRaw = useCallback(() => { onSave(editInfo.id, rawText) }, [editInfo.id, rawText, onSave])
  const handleCancel = useCallback(() => { onCancel() }, [onCancel])
  const tabMode = matrix.length > 0 ? 'grid' : 'raw'
  return (
    <div className="edit-layer-overlay table-edit-layer">
      <div className="edit-layer-content table-edit-content">
        <div className="edit-layer-header">
          <span className="edit-layer-type-badge" data-blocktype="table">表格</span>
          <span className="edit-layer-position">{editInfo.id}</span>
        </div>
        <div className="table-edit-body">
          {tabMode === 'grid' ? (
            <>
              <div className="table-edit-toolbar">
                <button className="edit-btn edit-btn-save" onClick={handleAddRow}>+ 加行</button>
                <button className="edit-btn edit-btn-cancel" onClick={handleRemoveRow}>- 删行</button>
              </div>
              <div className="table-edit-grid">
                <table className="table-edit-table">
                  <thead><tr>{matrix[0]?.map((_, ci) => <th key={ci} className="table-edit-th">{ci + 1}</th>)}</tr></thead>
                  <tbody>{matrix.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="table-edit-td"><textarea className="table-edit-cell-input" value={cell} onChange={e => handleCellChange(ri, ci, e.target.value)} rows={1} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          ) : (
            <textarea className="edit-layer-textarea" value={rawText} onChange={e => setRawText(e.target.value)} rows={10} placeholder="输入 Markdown 表格..." />
          )}
        </div>
        <div className="edit-layer-actions">
          <span className="edit-layer-hint">{tabMode === 'grid' ? '点击单元格编辑' : '直接编辑 Markdown 表格源码'}</span>
          <div className="edit-layer-buttons">
            <button className="edit-btn edit-btn-cancel" onClick={handleCancel}>取消</button>
            <button className="edit-btn edit-btn-save" onClick={tabMode === 'grid' ? handleSave : handleSaveRaw}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
