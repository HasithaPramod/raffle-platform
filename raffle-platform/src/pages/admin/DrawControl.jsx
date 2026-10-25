import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { dateTime, money, shortTime, ticketNo, youtubeEmbed } from '../../api/format.js'
import { closeSales, drawPrize, getCountries, getRaffle, getRaffles, getSettings, raffleStats, revealSeed, updateRaffle } from '../../api/server.js'
import { ConfirmButton, Empty, RaffleStatus, useToast } from '../../components/ui.jsx'
import { DEMO } from '../../env.js'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

function Step({ n, state, title, children }) {
  const color = state === 'done' ? 'var(--good)' : state === 'now' ? 'var(--accent-ink)' : 'var(--muted)'
  return (
    <div className={`card stack tight ${state === 'now' ? 'accent' : ''}`}>
      <div className="step-label" style={{ color }}>STEP {n} · {state === 'done' ? 'DONE' : state === 'now' ? 'NOW' : 'LATER'}</div>
      <div className="bold">{title}</div>
      {children}
    </div>
  )
}

export default function DrawControl() {
  useDb()
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const order = Object.fromEntries(getCountries().map((c, i) => [c.id, i]))
  const choices = getRaffles()
    .filter((r) => ['on_sale', 'sales_closed', 'live', 'results'].includes(r.status))
    .sort((a, b) => (order[a.countryId] ?? 99) - (order[b.countryId] ?? 99) || a.drawAt - b.drawAt)
  const raffle = (id && getRaffle(id)) || choices.find((r) => ['live', 'sales_closed'].includes(r.status)) || choices.find((r) => r.status === 'on_sale') || choices[0]
  const [stream, setStream] = useState(null)

  if (!raffle) return <Empty>No raffle is ready for a draw.</Empty>
  const stats = raffleStats(raffle.id)
  const drawn = Object.fromEntries(raffle.results.map((r) => [r.prizeId, r]))
  const allDrawn = raffle.prizes.every((p) => drawn[p.id])
  const closed = raffle.status !== 'on_sale'
  const streamValue = stream ?? raffle.youtubeUrl
  const act = (fn, msg) => async () => {
    const ok = await run(async () => {
      await fn()
      return true
    })
    if (ok && msg) toast(msg)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live draw · {raffle.title}</h1>
          <div className="small muted">{user.name} · every action is logged · draw time {dateTime(raffle.drawAt, raffle.timezone)}</div>
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="draw-raffle">Raffle</label>
          <select id="draw-raffle" className="input" style={{ width: 'auto' }} value={raffle.id} onChange={(e) => nav(`/admin/draw/${e.target.value}`)}>
            {choices.map((r) => <option key={r.id} value={r.id}>{r.countryId} · {r.title}</option>)}
          </select>
          <RaffleStatus status={raffle.status} />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="kpis">
        <Step n={1} state={closed ? 'done' : 'now'} title="Close sales">
          {closed ? (
            <>
              <div className="small muted">{stats.sold.toLocaleString()} tickets locked</div>
              <div className="tiny">Seed hash <span className="mono">{raffle.seedHash?.slice(0, 12)}…</span> published</div>
            </>
          ) : (
            <>
              <div className="small muted">{stats.sold.toLocaleString()} sold so far. Closing locks the ticket list and publishes the seed hash. Voids stop.</div>
              <ConfirmButton
                label="Close sales now"
                question="Close sales? This cannot be undone."
                confirmLabel="Yes, close sales"
                disabled={busy}
                onConfirm={act(() => closeSales(user.id, raffle.id), 'Sales closed. Seed hash published.')}
              />
            </>
          )}
        </Step>
        <Step n={2} state={youtubeEmbed(raffle.youtubeUrl) ? 'done' : closed ? 'now' : 'later'} title="YouTube stream">
          <div className="field">
            <label htmlFor="yt" className="tiny">Live link (shown on the buyer draw page)</label>
            <input id="yt" className="input" value={streamValue} onChange={(e) => setStream(e.target.value)} placeholder="https://youtube.com/live/…" />
          </div>
          <div className="row">
            <button className="btn sm" disabled={busy || streamValue === raffle.youtubeUrl} onClick={act(() => updateRaffle(user.id, raffle.id, { youtubeUrl: streamValue }), 'Stream link saved')}>Save link</button>
            <Link className="btn sm" to={`/buyer/live/${raffle.id}`} target={DEMO ? undefined : '_blank'}>Open buyer view</Link>
          </div>
        </Step>
        <Step n={3} state={raffle.status === 'results' ? 'done' : allDrawn && closed ? 'done' : closed ? 'now' : 'later'} title="Draw each prize tier">
          <div className="small muted">Winners are picked from the locked list. Results appear on the site instantly.</div>
        </Step>
      </div>

      <section className="card" aria-label="Prize tiers">
        <div className="list">
          {raffle.prizes.map((p) => {
            const r = drawn[p.id]
            const nextUp = closed && !r && raffle.prizes.find((x) => !drawn[x.id])?.id === p.id
            return (
              <div key={p.id} className="list-row wrap" style={{ padding: '14px 0' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <div className="bold">{p.tier}. {p.name} × {p.quantity}</div>
                  <div className="tiny muted">{money(p.valueCents, raffle.currency)} each · {r ? `drawn ${shortTime(r.drawnAt, raffle.timezone)} by ${r.drawnBy}` : 'not drawn yet'}</div>
                </div>
                {r ? (
                  <>
                    <div className="row wrap" style={{ flex: '2 1 300px', gap: 12 }}>
                      {r.numbers.map((n) => <span key={n} className="num-chip">{ticketNo(n)}</span>)}
                    </div>
                    <span className="badge good">Published</span>
                  </>
                ) : (
                  <button className="btn primary" style={{ minHeight: 52, padding: '0 24px' }} disabled={busy || !nextUp} onClick={act(() => drawPrize(user.id, { raffleId: raffle.id, prizeId: p.id }), `${p.name} drawn`)}>
                    Draw {p.quantity} number{p.quantity > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card row wrap" style={{ borderStyle: raffle.status === 'results' ? 'solid' : 'dashed' }}>
        <div style={{ flex: '1 1 300px' }}>
          <div className="step-label muted">STEP 4</div>
          <div className="bold">Reveal seed and open claims</div>
          <div className="small muted">Publishes the seed so anyone can verify the draw, then opens claims for {getSettings().claimDays} days.</div>
        </div>
        {raffle.status === 'results' ? (
          <Link className="btn" to={`/buyer/verify/${raffle.id}`} target={DEMO ? undefined : '_blank'}>Seed revealed · open verifier</Link>
        ) : (
          <button className="btn dark" disabled={busy || !allDrawn || raffle.status !== 'live'} onClick={act(() => revealSeed(user.id, raffle.id), 'Seed revealed. Claims are open.')}>
            {allDrawn ? 'Reveal seed' : 'Available after all tiers'}
          </button>
        )}
      </section>
    </>
  )
}
