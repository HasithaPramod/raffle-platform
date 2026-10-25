import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRaffle, verifyDraw } from '../../api/server.js'
import { Icon } from '../../components/ui.jsx'
import { useDb } from '../../hooks.js'

export default function Verify() {
  useDb()
  const { id } = useParams()
  const raffle = getRaffle(id)
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (raffle?.seed) verifyDraw(raffle).then(setResult)
  }, [raffle?.seed, raffle?.results.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!raffle) return <main className="content"><div className="card">Draw not found.</div></main>
  return (
    <main className="content">
      <div className="row">
        <Link to={`/buyer/live/${raffle.id}`} className="btn ghost icon-btn" aria-label="Back"><Icon name="back" /></Link>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Verify {raffle.title}</h1>
      </div>
      {!raffle.seed && <div className="card">The seed is revealed after the last prize is drawn.</div>}
      {result && (
        <section className={`result-hero ${result.ok ? 'good' : 'bad'}`}>
          <div className="bold">{result.ok ? 'This draw checks out' : 'This draw does NOT match'}</div>
          <div className="small">Your browser re-ran the draw from the published seed and ticket list.</div>
        </section>
      )}
      {result && (
        <div className="card list" style={{ padding: '0 14px' }}>
          {result.steps.map((s) => (
            <div key={s.label} className="list-row small">
              <span style={{ color: s.ok ? 'var(--good)' : 'var(--bad)' }}><Icon name={s.ok ? 'check' : 'x'} size={18} /></span>
              <span className="grow">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {raffle.seed && (
        <section className="card stack tight small">
          <div><span className="bold">Seed:</span> <span className="mono" style={{ wordBreak: 'break-all' }}>{raffle.seed}</span></div>
          <div><span className="bold">Seed hash:</span> <span className="mono" style={{ wordBreak: 'break-all' }}>{raffle.seedHash}</span></div>
          <div><span className="bold">Tickets in the draw:</span> {raffle.lockedNumbers.length.toLocaleString()}</div>
          <div className="muted">Method: winner index = HMAC-SHA256(seed, prizeId:round) mod remaining tickets, over the ticket numbers sorted ascending, without repeats.</div>
        </section>
      )}
    </main>
  )
}
