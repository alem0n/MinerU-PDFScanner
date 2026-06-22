import { useState } from 'react'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

export function SplitPane({ left, right, defaultLeftWidth = 50, minLeftWidth = 30, minRightWidth = 30 }: SplitPaneProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const handleMouseDown = () => {
    const onMove = (e: MouseEvent) => {
      const el = document.getElementById('split-pane-container')
      if (!el) return
      const pct = ((e.clientX - el.getBoundingClientRect().left) / el.offsetWidth) * 100
      setLeftWidth(Math.max(minLeftWidth, Math.min(100 - minRightWidth, pct)))
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  return (
    <div id="split-pane-container" className="flex flex-1 min-h-0 w-full">
      <div className="overflow-auto" style={{ width: `${leftWidth}%` }}>{left}</div>
       <div className="w-1 bg-gray-200 hover:bg-blue-600 cursor-col-resize flex-shrink-0 transition-colors" onMouseDown={handleMouseDown} />
      <div className="overflow-auto flex-1">{right}</div>
    </div>
  )
}
