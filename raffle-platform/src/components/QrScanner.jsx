import { useEffect, useId, useRef, useState } from 'react'
import { DEMO } from '../env.js'
import { Icon } from './ui.jsx'

// html5-qrcode's stop() can throw synchronously if the camera never started.
function stopScanner(s) {
  try {
    s.stop().then(() => s.clear()).catch(() => {})
  } catch {
    /* already stopped */
  }
}

// Scans a ticket QR with the camera, from a photo, or from pasted text.
// `demoTickets` lets you pick a ticket in the prototype without a printer
// or camera: [{label, token}].
export function QrScanner({ onResult, demoTickets = [] }) {
  const [mode, setMode] = useState(DEMO ? 'photo' : 'camera')
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const rawId = useId()
  const boxId = 'qr-' + rawId.replace(/[^a-zA-Z0-9]/g, '')
  const scannerRef = useRef(null)
  const doneRef = useRef(false)

  useEffect(() => {
    if (mode !== 'camera') return
    let cancelled = false
    doneRef.current = false
    setError('')
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const scanner = new Html5Qrcode(boxId, { verbose: false })
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (doneRef.current) return
            doneRef.current = true
            onResult(decoded)
          },
          () => {},
        )
        if (cancelled) stopScanner(scanner)
        else scannerRef.current = scanner
      } catch {
        if (!cancelled) setError('Camera not available here. Upload a photo of the QR or paste the code instead.')
      }
    })()
    return () => {
      cancelled = true
      const s = scannerRef.current
      scannerRef.current = null
      if (s) stopScanner(s)
    }
  }, [mode, boxId, onResult])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(boxId + 'f', { verbose: false })
      const decoded = await scanner.scanFile(file, false)
      scanner.clear()
      onResult(decoded)
    } catch {
      setError('No QR code found in that photo. Try a sharper, closer photo.')
    }
    e.target.value = ''
  }

  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Scan method">
        {[
          ['camera', 'camera', 'Camera'],
          ['photo', 'upload', 'Photo'],
          ['paste', 'list', 'Paste'],
        ].map(([key, icon, label]) => (
          <button key={key} role="tab" aria-selected={mode === key} className={`btn sm ${mode === key ? 'dark' : ''}`} onClick={() => setMode(key)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>
      {mode === 'camera' && <div id={boxId} className="scanner-box" />}
      {mode === 'photo' && (
        <div className="field">
          <label htmlFor={boxId + 'in'}>Photo of the ticket QR</label>
          <input id={boxId + 'in'} type="file" accept="image/*" capture="environment" className="input" style={{ paddingTop: 10 }} onChange={onFile} />
          <div id={boxId + 'f'} style={{ display: 'none' }} />
        </div>
      )}
      {mode === 'paste' && (
        <div className="field">
          <label htmlFor={boxId + 'tx'}>QR code text</label>
          <textarea id={boxId + 'tx'} className="input" placeholder="RFL1.…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn dark" disabled={!text.trim()} onClick={() => onResult(text.trim())}>Check this code</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {demoTickets.length > 0 && (
        <div className="field">
          <label htmlFor={boxId + 'demo'}>Demo: pick a ticket instead of scanning</label>
          <select id={boxId + 'demo'} className="input" defaultValue="" onChange={(e) => e.target.value && onResult(e.target.value)}>
            <option value="">Choose a ticket…</option>
            {demoTickets.map((t) => (
              <option key={t.token} value={t.token}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
