import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendHost = process.env.VITE_BACKEND_HOST || 'localhost'
const backendHttp = `http://${backendHost}:8000`
const backendWs = `ws://${backendHost}:8000`

function silenceProxyErrors(proxy) {
  proxy.on('error', () => {})
  proxy.on('close', () => {})
  proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
    socket?.on('error', () => {})
  })
  proxy.on('proxyReq', (_proxyReq, _req, socket) => {
    socket?.on('error', () => {})
  })
  proxy.on('proxyRes', (proxyRes) => {
    proxyRes.on('error', () => {})
  })
  proxy.on('end', () => {})
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendHttp,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: silenceProxyErrors,
      },
      '/health': {
        target: backendHttp,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: silenceProxyErrors,
      },
      '/ws': {
        target: backendWs,
        ws: true,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: silenceProxyErrors,
      },
    },
  },
})
