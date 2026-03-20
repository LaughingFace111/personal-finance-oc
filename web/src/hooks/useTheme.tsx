import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { theme as antdTheme } from 'antd'

type ThemeMode = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  antdAlgorithm: typeof antdTheme.defaultAlgorithm
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'themeMode'

// 检测系统主题
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

// 解析实际生效的主题
const resolveTheme = (mode: ThemeMode): ResolvedTheme => {
  if (mode === 'system') {
    return getSystemTheme()
  }
  return mode
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored as ThemeMode
      }
    }
    return 'system'
  })

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(mode))

  // 监听系统主题变化
  useEffect(() => {
    if (mode !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [mode])

  // 当 mode 变化时更新 theme
  useEffect(() => {
    setTheme(resolveTheme(mode))
  }, [mode])

  // 设置模式并持久化
  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)
  }

  const antdAlgorithm = theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode, antdAlgorithm }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

// 主题 CSS 变量
export const getThemeVariables = (theme: ResolvedTheme) => {
  if (theme === 'dark') {
    return {
      '--bg-page': '#141414',
      '--bg-card': '#1f1f1f',
      '--bg-elevated': '#262626',
      '--bg-input': '#2a2a2a',
      '--text-primary': '#ffffff',
      '--text-secondary': 'rgba(255, 255, 255, 0.65)',
      '--text-tertiary': 'rgba(255, 255, 255, 0.45)',
      '--border-color': '#424242',
      '--border-light': '#303030',
      '--accent-color': '#1677ff',
      '--accent-red': '#ff4d4f',
      '--accent-green': '#52c41a',
      '--shadow-card': '0 2px 8px rgba(0, 0, 0, 0.3)',
      '--shadow-fab': '0 4px 16px rgba(0, 0, 0, 0.4)',
    }
  }
  return {
    '--bg-page': '#f5f5f5',
    '--bg-card': '#ffffff',
    '--bg-elevated': '#ffffff',
    '--bg-input': '#ffffff',
    '--text-primary': 'rgba(0, 0, 0, 0.88)',
    '--text-secondary': 'rgba(0, 0, 0, 0.65)',
    '--text-tertiary': 'rgba(0, 0, 0, 0.45)',
    '--border-color': '#d9d9d9',
    '--border-light': '#f0f0f0',
    '--accent-color': '#1677ff',
    '--accent-red': '#ff4d4f',
    '--accent-green': '#52c41a',
    '--shadow-card': '0 2px 8px rgba(0, 0, 0, 0.08)',
    '--shadow-fab': '0 4px 16px rgba(0, 0, 0, 0.15)',
  }
}
