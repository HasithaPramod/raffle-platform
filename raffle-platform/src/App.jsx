import { Component, useEffect, useState } from 'react'
import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DEMO } from './env.js'

const Router = DEMO ? MemoryRouter : HashRouter
import { init } from './api/server.js'
import { AdminLayout, BuyerLayout, PosLayout, RequireRole } from './components/Layouts.jsx'
import { ToastProvider } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import AuditLog from './pages/admin/AuditLog.jsx'
import Countries from './pages/admin/Countries.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import DrawControl from './pages/admin/DrawControl.jsx'
import Raffles from './pages/admin/Raffles.jsx'
import Sellers from './pages/admin/Sellers.jsx'
import CheckTicket from './pages/buyer/CheckTicket.jsx'
import Draws from './pages/buyer/Draws.jsx'
import Home from './pages/buyer/Home.jsx'
import LiveDraw from './pages/buyer/LiveDraw.jsx'
import MyTickets from './pages/buyer/MyTickets.jsx'
import RaffleDetail from './pages/buyer/RaffleDetail.jsx'
import Verify from './pages/buyer/Verify.jsx'
import Earnings from './pages/seller/Earnings.jsx'
import Scan from './pages/seller/Scan.jsx'
import Sell from './pages/seller/Sell.jsx'
import { SessionProvider } from './session.jsx'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login">
        <div className="card stack">
          <div className="bold">Something went wrong on this screen.</div>
          <div className="small muted">{String(this.state.error.message || this.state.error)}</div>
          <button className="btn dark" onClick={() => { this.setState({ error: null }); window.location.hash = '#/' }}>Back to start</button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    init()
      .then(() => setReady(true))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="login"><div className="card error">Could not start: {error}</div></div>
  if (!ready) return <div className="login"><div className="card muted">Setting up demo data…</div></div>

  return (
    <ErrorBoundary>
    <SessionProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/buyer" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/buyer" element={<BuyerLayout />}>
              <Route index element={<Home />} />
              <Route path="draws" element={<Draws />} />
              <Route path="raffle/:id" element={<RaffleDetail />} />
              <Route path="live/:id" element={<LiveDraw />} />
              <Route path="tickets" element={<MyTickets />} />
              <Route path="check" element={<CheckTicket />} />
              <Route path="verify/:id" element={<Verify />} />
            </Route>
            <Route path="/pos" element={<RequireRole roles={['seller']}><PosLayout /></RequireRole>}>
              <Route index element={<Sell />} />
              <Route path="scan" element={<Scan />} />
              <Route path="earnings" element={<Earnings />} />
            </Route>
            <Route path="/admin" element={<RequireRole roles={['operator', 'super_admin']}><AdminLayout /></RequireRole>}>
              <Route index element={<Dashboard />} />
              <Route path="raffles" element={<Raffles />} />
              <Route path="draw" element={<DrawControl />} />
              <Route path="draw/:id" element={<DrawControl />} />
              <Route path="sellers" element={<Sellers />} />
              <Route path="countries" element={<Countries />} />
              <Route path="audit" element={<AuditLog />} />
            </Route>
            <Route path="*" element={<Navigate to="/buyer" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </SessionProvider>
    </ErrorBoundary>
  )
}
