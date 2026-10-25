import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { STATUS_LABEL } from '../api/format.js'

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  play: 'M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9l5 3-5 3z',
  ticket: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  back: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  printer: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  car: 'M5 16l1.5-5h11l1.5 5M3 16h18v4H3zM7.5 20v.01M16.5 20v.01',
  bike: 'M6 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 17l4-7h5l3 7M13 6h3',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v.01M18 14v.01',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 4-6 7-6s6 2 7 6M17 11a3 3 0 1 0 0-6M22 21c-.6-2.6-2-4.4-4-5.3',
  log: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
}

export function Icon({ name, size = 22, stroke = 1.9, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  )
}

export function prizeIcon(name = '') {
  const n = name.toLowerCase()
  if (n.includes('car')) return 'car'
  if (n.includes('bike') || n.includes('motor')) return 'bike'
  return 'cash'
}

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="btn ghost icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = useCallback((text, tone = '') => {
    setToast({ text, tone, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export function RaffleStatus({ status }) {
  const tone = { on_sale: 'good', live: 'live', results: 'ink', cancelled: 'bad', sales_closed: 'warn' }[status] ?? ''
  return <span className={`badge ${tone}`}>{status === 'live' ? '● LIVE' : STATUS_LABEL[status]}</span>
}

export function TicketStatus({ ticket, raffle }) {
  if (ticket.status === 'void') return <span className="badge bad">Void</span>
  if (ticket.status === 'claimed') return <span className="badge">Prize claimed</span>
  if (ticket.status === 'won') return <span className="badge warn">Won · claim</span>
  if (raffle && ['results', 'settled'].includes(raffle.status)) return <span className="badge">No prize</span>
  return <span className="badge good">In the draw</span>
}

export function Empty({ children }) {
  return <div className="card flat muted small" style={{ textAlign: 'center', padding: 24 }}>{children}</div>
}

// Two-step confirmation inside the page (no browser confirm dialog).
export function ConfirmButton({ label, confirmLabel, question, onConfirm, className = 'btn dark', disabled }) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button className={className} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>
  return (
    <span className="stack tight">
      <span className="small bold">{question}</span>
      <span className="row">
        <button className="btn sm danger" disabled={disabled} onClick={() => { setAsking(false); onConfirm() }}>{confirmLabel}</button>
        <button className="btn sm" onClick={() => setAsking(false)}>Keep</button>
      </span>
    </span>
  )
}
