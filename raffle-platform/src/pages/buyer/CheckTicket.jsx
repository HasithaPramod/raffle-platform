import { useCallback, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { parseTicketNo } from '../../api/format.js'
import { checkTicket, getRaffles } from '../../api/server.js'
import { CheckResult } from '../../components/CheckResult.jsx'
import { QrScanner } from '../../components/QrScanner.jsx'
import { useDb } from '../../hooks.js'

export default function CheckTicket() {
  useDb()
  const { country } = useOutletContext()
  const raffles = getRaffles().filter((r) => r.status !== 'draft' && r.countryId === country?.id)
  const [res, setRes] = useState(null)
  const [raffleId, setRaffleId] = useState(raffles[0]?.id ?? '')
  const [number, setNumber] = useState('')
  const [scanKey, setScanKey] = useState(0)
  const selectedId = raffles.some((r) => r.id === raffleId) ? raffleId : raffles[0]?.id ?? ''

  const onScan = useCallback(async (token) => setRes(await checkTicket({ token })), [])

  async function byNumber(e) {
    e.preventDefault()
    const n = parseTicketNo(number)
    if (Number.isNaN(n)) return
    setRes(await checkTicket({ raffleId: selectedId, number: n }))
  }

  return (
    <main className="content">
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Check a ticket</h1>
      <CheckResult res={res} />
      {res && <button className="btn" onClick={() => { setRes(null); setScanKey((k) => k + 1) }}>Check another</button>}
      <section className="card stack" aria-label="Scan QR">
        <h2>Scan the QR</h2>
        <QrScanner key={scanKey} onResult={onScan} />
      </section>
      <form className="card stack" onSubmit={byNumber} aria-label="Type ticket number">
        <h2>Or type the number</h2>
        <div className="field">
          <label htmlFor="raffle">Raffle</label>
          <select id="raffle" className="input" value={selectedId} onChange={(e) => setRaffleId(e.target.value)}>
            {raffles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="num">Ticket number</label>
          <input id="num" className="input mono" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="06 418" />
        </div>
        <button className="btn dark" type="submit">Check</button>
      </form>
    </main>
  )
}
