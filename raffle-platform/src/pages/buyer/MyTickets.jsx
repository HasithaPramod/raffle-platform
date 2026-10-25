import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dateTime, money, ticketNo } from '../../api/format.js'
import { getBuyerTickets, getRaffle, prizeName, revealCode } from '../../api/server.js'
import { QrImage } from '../../components/QrImage.jsx'
import { Empty, TicketStatus } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

export default function MyTickets() {
  useDb()
  const { user } = useSession()
  const [selectedId, setSelectedId] = useState(null)
  const [codes, setCodes] = useState({})
  const { busy, error, run } = useAction()

  if (user?.role !== 'buyer') {
    return (
      <main className="content">
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>My tickets</h1>
        <div className="card stack">
          <span>Log in to see the tickets you bought online.</span>
          <Link className="btn primary" to="/login?next=/buyer/tickets">Log in</Link>
          <Link className="btn" to="/buyer/check">Check a paper ticket instead</Link>
        </div>
      </main>
    )
  }

  const tickets = getBuyerTickets(user.id)
  const selected = tickets.find((t) => t.id === selectedId) ?? tickets.find((t) => t.status === 'won') ?? tickets[0]
  const raffle = selected && getRaffle(selected.raffleId)
  const prize = selected && prizeName(raffle, selected.prizeId)

  async function show() {
    const code = await run(() => revealCode(user.id, selected.id))
    if (code) setCodes((c) => ({ ...c, [selected.id]: code }))
  }

  return (
    <main className="content">
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>My tickets</h1>
      {!tickets.length && <Empty>No tickets yet. <Link to="/buyer">Buy one</Link>.</Empty>}
      {selected && (
        <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row between" style={{ background: 'var(--ink)', color: '#fff', padding: '12px 16px' }}>
            <span className="bold">{raffle.title}</span>
            <span className="tiny" style={{ color: '#c9d3df' }}>Draw {dateTime(raffle.drawAt, raffle.timezone)}</span>
          </div>
          <div className="stack" style={{ alignItems: 'center', padding: 16 }}>
            <QrImage value={selected.token} size={180} label={`QR for ticket ${ticketNo(selected.number)}`} />
            <div className="ticket-no" style={{ fontSize: 28 }}>{ticketNo(selected.number)}</div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <TicketStatus ticket={selected} raffle={raffle} />
              <span className="tiny muted">{raffle.mode === 'free_entry' ? 'Free entry' : money(selected.priceCents, raffle.currency)} · {selected.channel === 'online' ? 'online' : 'paper'}</span>
            </div>
            {prize && <div className="bold" style={{ color: 'var(--accent-ink)' }}>Prize: {prize.name} ({money(prize.valueCents, raffle.currency)})</div>}
            {codes[selected.id] ? (
              <div className="card flat" style={{ background: 'var(--ground)', width: '100%', textAlign: 'center' }}>
                <div className="tiny muted">Security code: show it only to the person paying your prize</div>
                <div className="ticket-no" style={{ fontSize: 24, letterSpacing: '0.2em' }}>{codes[selected.id]}</div>
              </div>
            ) : (
              <button className="btn block" disabled={busy || selected.status === 'void'} onClick={show}>Show security code (needed to claim)</button>
            )}
            {error && <div className="error">{error}</div>}
            {selected.status === 'won' && <div className="small muted" style={{ textAlign: 'center' }}>To claim, show this QR and the code at any seller or our office.</div>}
          </div>
        </article>
      )}
      {tickets.length > 1 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>All tickets</h2>
          <div className="card list" style={{ padding: '0 14px' }}>
            {tickets.map((t) => {
              const r = getRaffle(t.raffleId)
              return (
                <button
                  key={t.id}
                  className="list-row"
                  onClick={() => setSelectedId(t.id)}
                  aria-pressed={selected?.id === t.id}
                  style={{ width: '100%', background: selected?.id === t.id ? 'var(--ground)' : 'transparent', border: 'none', borderTop: '1px solid var(--line-soft)', cursor: 'pointer', textAlign: 'left', minHeight: 56 }}
                >
                  <div className="grow">
                    <div className="ticket-no">{ticketNo(t.number)}</div>
                    <div className="tiny muted">{r.title}</div>
                  </div>
                  <TicketStatus ticket={t} raffle={r} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
