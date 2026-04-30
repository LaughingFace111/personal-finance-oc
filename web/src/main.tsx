import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import './index.css'
import './styles.css'

const ThemedApp = () => {
  const { theme: resolvedTheme, antdAlgorithm } = useTheme()
  
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
        components: {
          Card: {
            colorBgContainer: resolvedTheme === 'dark' ? '#1f1f1f' : '#ffffff',
          },
          Input: {
            colorBgContainer: resolvedTheme === 'dark' ? '#2a2a2a' : '#ffffff',
          },
          Message: {
            contentBg: resolvedTheme === 'dark' ? '#262626' : '#ffffff',
            colorText: resolvedTheme === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.88)',
          },
          Notification: {
            colorBgElevated: resolvedTheme === 'dark' ? '#262626' : '#ffffff',
            colorText: resolvedTheme === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.88)',
            colorTextHeading: resolvedTheme === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.88)',
            colorTextDescription: resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.65)',
          },
          Select: {
            colorBgContainer: resolvedTheme === 'dark' ? '#2a2a2a' : '#ffffff',
            colorBgElevated: resolvedTheme === 'dark' ? '#262626' : '#ffffff',
          },
          Modal: {
            contentBg: resolvedTheme === 'dark' ? '#1f1f1f' : '#ffffff',
            headerBg: resolvedTheme === 'dark' ? '#1f1f1f' : '#ffffff',
          },
          Drawer: {
            colorBgElevated: resolvedTheme === 'dark' ? '#1f1f1f' : '#ffffff',
          },
          Menu: {
            darkItemBg: '#141414',
            darkSubMenuItemBg: '#1f1f1f',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>,
)
