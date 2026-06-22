import { useState, useCallback } from 'react'

export type MarkdownTheme = 'base' | 'dark' | 'light'

export function useMarkdownTheme(initial: MarkdownTheme = 'base') {
  const [theme, setTheme] = useState<MarkdownTheme>(initial)
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'base' : 'dark')
  }, [])
  return { theme, setTheme, toggleTheme }
}
