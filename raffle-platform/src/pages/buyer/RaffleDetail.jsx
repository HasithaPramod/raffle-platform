import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { countdown, dateTime, money, pad2, parseTicketNo, ticketNo } from '../../api/format.js'
import { buyOnline, enterFree, getRaffle, holdNumbers, raffleStats, releaseHold } from '../../api/server.js'
import { PrizeArt } from '../../components/PrizeArt.jsx'
import { Icon, Modal, RaffleStatus, useToast } from '../../components/ui.jsx'
import { useAction, useDb, useNow } from '../../hooks.js'
import { useSession } from '../../session.jsx'

function Checkout({ raffle, hold, onClose, onDone }) {
  const { user } = useSession()
  const [sellerCode, setSellerCode] = useState('')
  const { busy, error, run } = useAction()
  useNow(1000)
  const left = countdown(hold.expiresAt)
  const expired = hold.expiresAt <= Date.now()
  async function pay() {
    const tickets = await run(() => buyOnline(user.id, { holdId: hold.id, sellerCode }))
    if (tickets) onDone(tickets)
  }
  return (
    <Modal title="Checkout" onClose={onClose}>
      <div className="stack tight">
        <span className="label">Your numbers</span>
        <div className="row wrap">{hold.numbers.map((n) => <span key={n} className="chip-no">{ticketNo(n)}</span>)}</div>
        <span className={`small ${expired ? 'error' : 'muted'}`}>
          {expired ? 'Hold expired. Close and choose again.' : `Held for you: ${pad2(left.m)}:${pad2(left.s)}`}
        </span>
      </div>
      <div className="field">
        <label htmlFor="seller-code">Seller code (optional)</label>
        <input id="seller-code" className="input" placeholder="e.g. S-1042" value={sellerCode} onChange={(e) => setSellerCode(e.target.value)} />
        <span className="hint">If a seller sent you here, their code gives them the commission.</span>
      </div>
      <div className="row between card flat" style={{ background: 'var(--ground)' }}>
        <span>{hold.numbers.length} × {money(raffle.priceCents, raffle.currency)}</span>
        <span className="bold" style={{ fontSize: 18 }}>{money(raffle.priceCents * hold.numbers.length, raffle.currency)}</span>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn primary big" disabled={busy || expired} onClick={pay}>
        {busy ? 'Paying…' : 'Pay (demo payment)'}
      </button>
      <div className="hint">In the live system this opens the card or wallet payment page; tickets are issued when the payment is confirmed.</div>
    </Modal>
  )
}

export default function RaffleDetail() {
  useDb()
  const { id } = useParams()
  const raffle = getRaffle(id)
  const { user } = useSession()
  const nav = useNavigate()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [picks, setPicks] = useState('')
  const [hold, setHold] = useState(null)
  const { busy, error, run } = useAction()

  if (!raffle) return <main className="content"><div className="card">Raffle not found.</div></main>
  const stats = raffleStats(raffle.id)
  const isBuyer = user?.role === 'buyer'
  const pickList = picks.split(/[,\s]+/).filter(Boolean).map(parseTicketNo)

  async function start() {
    if (pickList.some((n) => Number.isNaN(n))) return
    const h = await run(() => holdNumbers(user.id, { raffleId: raffle.id, qty: Math.max(qty, pickList.length), picks: pickList }))
    if (h) setHold(h)
  }

  return (
    <main className="content wide">
      <div className="row">
        <Link to="/buyer" className="btn ghost icon-btn" aria-label="Back"><Icon name="back" /></Link>
        <h1 className="grow" style={{ fontSize: 20, fontWeight: 800 }}>{raffle.title}</h1>
        <RaffleStatus status={raffle.status} />
      </div>
      <div className="two-col">
      <div className="stack">
      <div className="detail-art"><PrizeArt name={raffle.prizes[0]?.name} /></div>
      <div className="row wrap">
        <span className="badge" style={{ background: '#fff', border: '1px solid var(--line)' }}>Draw: {dateTime(raffle.drawAt, raffle.timezone)}</span>
        <span className="badge" style={{ background: '#fff', border: '1px solid var(--line)' }}>Live on YouTube</span>
        <span className="badge" style={{ background: '#fff', border: '1px solid var(--line)' }}>{stats.sold.toLocaleString()} / {raffle.totalTickets.toLocaleString()} {raffle.mode === 'free_entry' ? 'entries' : 'sold'}</span>
      </div>
      <section className="card stack tight" aria-label="Prizes">
        {raffle.prizes.map((p) => (
          <div key={p.id} className="row between small">
            <span className="bold">{['1st', '2nd', '3rd', '4th', '5th'][p.tier - 1] ?? `${p.tier}th`} prize</span>
            <span>{p.name} × {p.quantity}</span>
          </div>
        ))}
      </section>

      </div>
      <div className="stack sticky-col">
      {raffle.status === 'on_sale' && raffle.mode === 'free_entry' ? (
        <section className="card stack" aria-label="Enter free">
          <div className="bold">Free to enter</div>
          <div className="small muted">No purchase or payment is needed. Enter free online once a day, or get entries with purchases at partner shops.</div>
          {error && <div className="error">{error}</div>}
          {isBuyer ? (
            <button
              className="btn primary big"
              disabled={busy}
              onClick={async () => {
                const t = await run(() => enterFree(user.id, { raffleId: raffle.id }))
                if (t) {
                  toast(`Entry ${ticketNo(t.number)} confirmed`)
                  nav('/buyer/tickets')
                }
              }}
            >
              Enter free
            </button>
          ) : (
            <Link className="btn primary big" to={`/login?next=/buyer/raffle/${raffle.id}`}>Log in to enter free</Link>
          )}
        </section>
      ) : raffle.status === 'on_sale' ? (
        <section className="card stack" aria-label="Buy tickets">
          <div className="row between">
            <span className="bold">Tickets</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer tickets" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="More tickets" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="picks">Lucky numbers (optional)</label>
            <input id="picks" className="input mono" placeholder="e.g. 7777, 12345" value={picks} onChange={(e) => setPicks(e.target.value)} />
            <span className="hint">Leave empty for random numbers. Chosen numbers are held for 10 minutes while you pay.</span>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <div className="stack tight">
              <span className="tiny muted">Total</span>
              <span className="bold" style={{ fontSize: 20 }}>{money(raffle.priceCents * Math.max(qty, pickList.length), raffle.currency)}</span>
            </div>
            {isBuyer ? (
              <button className="btn primary big grow" disabled={busy} onClick={start}>Choose numbers and pay</button>
            ) : (
              <Link className="btn primary big grow" to={`/login?next=/buyer/raffle/${raffle.id}`}>Log in to buy</Link>
            )}
          </div>
        </section>
      ) : (
        <Link className="btn dark big" to={`/buyer/live/${raffle.id}`}>See the draw and results</Link>
      )}
      </div>
      </div>

      {hold && (
        <Checkout
          raffle={raffle}
          hold={hold}
          onClose={() => {
            releaseHold(user.id, hold.id)
            setHold(null)
          }}
          onDone={(tickets) => {
            setHold(null)
            toast(`${tickets.length} ticket${tickets.length > 1 ? 's' : ''} confirmed`)
            nav('/buyer/tickets')
          }}
        />
      )}
    </main>
  )
}
