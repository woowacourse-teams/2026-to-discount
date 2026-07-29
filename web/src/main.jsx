import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import { startAnalytics } from './analytics.js'
import './App.css'

// StrictMode가 컴포넌트를 두 번 마운트하므로 page_view가 두 번 찍히지
// 않도록 React 밖에서 한 번만 시작한다.
startAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {/* Vercel 배포 트래픽 집계. /react 엔트리를 쓴다 — Next.js가 아니라
        Vite라 /next는 안 맞는다. 자체 /api/events 수집(analytics.js)과는
        별개로, Vercel 대시보드에서 보는 용도다. */}
    <Analytics />
  </React.StrictMode>,
)
