import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { dateTime, parseTicketNo, prizeLabel, ticketNo, youtubeEmbed } from '../../api/format.js'
import { checkTicket, getRaffle, raffleStats } from '../../api/server.js'
import { CheckResult } from '../../components/CheckResult.jsx'
import { Icon, RaffleStatus } from '../../components/ui.jsx'
import { useDb } from '../../hooks.js'
import { Countdown } from './Home.jsx'
import { DEMO } from '../../env.js'

export default function LiveDraw() {
  useDb()
  const { id } = useParams()
  const raffle = getRaffle(id)
  const [number, setNumber] = useState('')
  const [res, setRes] = useState(null)
  if (!raffle) return <main className="content"><div className="card">Draw not found.</div></main>

  const embed = youtubeEmbed(raffle.youtubeUrl)
  const stats = raffleStats(raffle.id)
  const drawn = Object.fromEntries(raffle.results.map((r) => [r.prizeId, r]))
  const nextPrize = raffle.prizes.find((p) => !drawn[p.id])
  const finished = ['results', 'settled'].includes(raffle.status)

  async function check(e) {
    e.preventDefault()
    const n = parseTicketNo(number)
    if (Number.isNaN(n)) return
    setRes(await checkTicket({ raffleId: raffle.id, number: n }))
  }

  return (
    <main className="content" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
      <div className="row" style={{ padding: '12px 16px 0' }}>
        <Link to="/buyer/draws" className="btn ghost icon-btn" aria-label="Back"><Icon name="back" /></Link>
        <h1 className="grow" style={{ fontSize: 18, fontWeight: 800 }}>{raffle.title}</h1>
        <RaffleStatus status={raffle.status} />
      </div>
      <div className="video">
        {embed && DEMO ? (
          <a className="btn primary" href={raffle.youtubeUrl} target="_blank" rel="noreferrer"><Icon name="play" /> Watch the live stream on YouTube</a>
        ) : embed ? (
          <iframe src={embed} title={`${raffle.title} live stream`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <div className="stack tight" style={{ alignItems: 'center', textAlign: 'center', padding: 16 }}>
            <Icon name="play" size={40} />
            <span className="small">{finished ? 'Replay link not added yet' : 'The YouTube stream appears here when the admin adds the live link'}</span>
          </div>
        )}
      </div>
      <div className="stack" style={{ padding: '0 16px' }}>
        {['on_sale', 'sales_closed'].includes(raffle.status) && (
          <section className="hero">
            <div className="small muted">Draw starts {dateTime(raffle.drawAt, raffle.timezone)}</div>
            <Countdown to={raffle.drawAt} />
          </section>
        )}
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>Winning numbers</h2>
        {raffle.prizes.map((p) => {
          const r = drawn[p.id]
          const first = p.tier === 1
          return (
            <div key={p.id} className={`card ${first && r ? 'accent' : ''}`} style={!r ? { borderStyle: 'dashed' } : undefined}>
              <div className="row between">
                <span className="tiny bold" style={{ letterSpacing: '0.06em', color: first ? 'var(--accent-ink)' : 'var(--muted)' }}>
                  {prizeLabel(p, raffle.currency).toUpperCase()} × {p.quantity}
                </span>
                {!r && (
                  <span className="small bold" style={{ color: 'var(--good)' }}>
                    {raffle.status === 'live' && nextPrize?.id === p.id ? 'Drawing next…' : 'Not drawn yet'}
                  </span>
                )}
              </div>
              {r && (
                <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                  {r.numbers.map((n) =>
                    first ? (
                      <span key={n} className="ticket-no" style={{ fontSize: 30 }}>{ticketNo(n)}</span>
                    ) : (
                      <span key={n} className="num-chip">{ticketNo(n)}</span>
                    ),
                  )}
                </div>
              )}
            </div>
          )
        })}
        <form className="field" onSubmit={check}>
          <label htmlFor="check-no">Check my ticket</label>
          <div className="row">
            <input id="check-no" className="input mono grow" inputMode="numeric" placeholder="Ticket number" value={number} onChange={(e) => setNumber(e.target.value)} />
            <button className="btn dark" type="submit">Check</button>
            <Link className="btn icon-btn" to="/buyer/check" aria-label="Scan a ticket QR"><Icon name="scan" /></Link>
          </div>
        </form>
        <CheckResult res={res} />
        <div className="tiny muted" style={{ lineHeight: 1.6 }}>
          {raffle.seedHash ? (
            <>
              {stats.sold.toLocaleString()} tickets locked at sales close. Seed hash published before the draw:{' '}
              <span className="mono" style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{raffle.seedHash.slice(0, 16)}…</span>{' '}
              {raffle.seed ? <Link to={`/buyer/verify/${raffle.id}`}>Verify this draw</Link> : 'The seed is revealed after the last prize.'}
            </>
          ) : (
            'When sales close, a hash of the secret draw seed is published here so the result can be checked afterwards.'
          )}
        </div>
      </div>
    </main>
  )
}
