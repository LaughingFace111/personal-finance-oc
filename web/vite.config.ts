import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '192.168.22.221',
      '.cpolar.top',
      '.cpolar.cn',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // 🛡️ L: 图表库强制独立分包，大幅缩短核心 JS 解析时间
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'vendor-charts'
          }
          if (id.includes('node_modules/antd')) {
            return 'vendor-antd'
          }
          if (id.includes('node_modules/@ant-design') || id.includes('node_modules/rc-')) {
            return 'vendor-antd-large'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
