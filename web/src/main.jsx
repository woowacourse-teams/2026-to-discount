import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { startAnalytics } from './analytics.js'
import './App.css'

// StrictMode가 컴포넌트를 두 번 마운트하므로 page_view가 두 번 찍히지
// 않도록 React 밖에서 한 번만 시작한다.
startAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
