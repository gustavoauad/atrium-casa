import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  cycleTheme: () => void
  /** tema efetivamente aplicado (resolve 'system' para 'light'|'dark') */
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  if (theme === 'dark') root.classList.add('dark')
  if (theme === 'light') root.classList.add('light')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('atrium_theme')
    return stored === 'dark' || stored === 'light' ? stored : 'system'
  })
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? (getSystemPrefersDark() ? 'dark' : 'light') : theme,
  )

  useEffect(() => {
    applyThemeClass(theme)
    localStorage.setItem('atrium_theme', theme)
    setResolved(theme === 'system' ? (getSystemPrefersDark() ? 'dark' : 'light') : theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
  }

  function cycleTheme() {
    setThemeState((prev) => {
      const current = prev === 'system' ? (getSystemPrefersDark() ? 'dark' : 'light') : prev
      return current === 'dark' ? 'light' : 'dark'
    })
  }

  return <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, resolved }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
