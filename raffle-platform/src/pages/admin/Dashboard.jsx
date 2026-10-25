import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ago, countdown, money, moneyShort, ticketNo } from '../../api/format.js'
import { decideClaim, decideDeposit, decideRequest, getApprovals, getRaffles, getSms, platformStats, sellerLeaderboard, unlockTicket } from '../../api/server.js'
import { Empty, RaffleStatus, useToast } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

const KIND = {
  claim: ['CLAIM', 'warn'],
  void: ['VOID', 'bad'],
  reprint: ['REPRINT', ''],
  deposit: ['DEPOSIT', 'good'],
  locked: ['LOCKED', 'bad'],
}

function ApprovalRow({ item }) {
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const superOnly = item.kind === 'claim' || item.kind === 'deposit'
  const canAct = !superOnly || user.role === 'super_admin'
  const [label, tone] = KIND[item.kind]

  async function decide(approve) {
    const fn = {
      claim: () => decideClaim(user.id, { claimId: item.id, approve }),
      deposit: () => decideDeposit(user.id, { depositId: item.id, approve }),
      void: () => decideRequest(user.id, { requestId: item.id, approve }),
      reprint: () => decideRequest(user.id, { requestId: item.id, approve }),
      locked: () => unlockTicket(user.id, item.id),
    }[item.kind]
    const ok = await run(async () => {
      await fn()
      return true
    })
    if (ok) toast(item.kind === 'locked' ? 'Ticket unlocked' : approve ? 'Approved' : 'Rejected')
  }

  let text = ''
  if (item.kind === 'claim') text = `${ticketNo(item.ticket.number)} · ${money(item.claim.valueCents, item.currency)} · ${item.claim.claimantName}, ${item.idLabel} ${item.claim.claimantNic}`
  if (item.kind === 'void') text = `${ticketNo(item.ticket.number)} · ${item.sellerId} · ${item.reason}`
  if (item.kind === 'reprint') text = `${ticketNo(item.ticket.number)} · ${item.sellerId} · reprint ${item.ticket.reprintCount + 1}`
  if (item.kind === 'deposit') text = `${item.sellerId} · ${money(item.deposit.amountCents, item.currency)} · ${item.deposit.reference}`
  if (item.kind === 'locked') text = `${ticketNo(item.ticket.number)} · too many wrong codes`

  return (
    <div className="list-row">
      <span className={`tag badge ${tone}`}>{label}</span>
      <div className="grow small">
        <div>{text}</div>
        <div className="tiny muted">{ago(item.at)}{!canAct ? ' · Super Admin decides' : ''}</div>
        {error && <div className="error">{error}</div>}
      </div>
      {canAct && (
        <>
          <button className="btn sm dark" disabled={busy} onClick={() => decide(true)}>{item.kind === 'locked' ? 'Unlock' : 'Approve'}</button>
          {item.kind !== 'locked' && <button className="btn sm" disabled={busy} onClick={() => decide(false)}>Reject</button>}
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  useDb()
  const raffles = getRaffles().filter((r) => r.status !== 'draft' && r.status !== 'cancelled')
  const def = raffles.filter((r) => ['on_sale', 'sales_closed', 'live'].includes(r.status)).sort((a, b) => a.drawAt - b.drawAt)[0] ?? raffles[0]
  const [raffleId, setRaffleId] = useState(def?.id)
  const raffle = raffles.find((r) => r.id === raffleId) ?? def
  const approvals = getApprovals()
  const sms = getSms().slice(0, 6)

  if (!raffle) return <Empty>No raffles yet. <Link to="/admin/raffles">Create one</Link>.</Empty>
  const s = platformStats(raffle.id)
  const board = sellerLeaderboard(raffle.id)
  const c = countdown(raffle.drawAt)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="small muted">
            {raffle.title} · <RaffleStatus status={raffle.status} />{' '}
            {['on_sale', 'sales_closed'].includes(raffle.status) && `· draw in ${c.d} d ${c.h} h`}
          </div>
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="dash-raffle">Raffle</label>
          <select id="dash-raffle" className="input" style={{ width: 'auto' }} value={raffle.id} onChange={(e) => setRaffleId(e.target.value)}>
            {raffles.map((r) => <option key={r.id} value={r.id}>{r.countryId} · {r.title}</option>)}
          </select>
          <Link className="btn primary" to="/admin/raffles">New raffle</Link>
        </div>
      </div>
      <div className="kpis">
        <div className="card kpi"><div className="label">Tickets sold</div><div className="value">{s.sold.toLocaleString()}</div><div className="tiny muted">of {s.total.toLocaleString()} · {s.pos} POS · {s.online} online</div></div>
        <div className="card kpi"><div className="label">Sales value</div><div className="value">{moneyShort(s.salesCents, raffle.currency)}</div><div className="tiny muted">{raffle.mode === 'free_entry' ? 'Free entry: no ticket sales' : `${s.sold.toLocaleString()} × ${money(raffle.priceCents, raffle.currency)}`}</div></div>
        <div className="card kpi"><div className="label">Commission earned</div><div className="value">{money(s.commissionCents, raffle.currency)}</div><div className="tiny muted">{raffle.mode === 'free_entry' ? `${money(raffle.commissionPerEntryCents, raffle.currency)} per entry` : `${raffle.commissionPct}% default rate`}</div></div>
        <div className="card kpi"><div className="label">Cash still with sellers</div><div className="value">{money(s.cashWithSellers, raffle.currency)}</div><div className="tiny" style={{ color: s.nearLimit ? 'var(--warn)' : 'var(--muted)', fontWeight: s.nearLimit ? 800 : 400 }}>{s.nearLimit} seller{s.nearLimit === 1 ? '' : 's'} near their limit</div></div>
      </div>
      <div className="cols">
        <section className="card">
          <h2>Needs approval · {approvals.length}</h2>
          <div className="list">
            {approvals.map((a) => <ApprovalRow key={a.kind + a.id} item={a} />)}
            {!approvals.length && <div className="list-row small muted">Nothing waiting.</div>}
          </div>
        </section>
        <section className="card">
          <h2>Sellers · {raffle.title}</h2>
          <div className="scroll-x">
            <table className="table" style={{ minWidth: 440 }}>
              <thead><tr><th>Seller</th><th>Sold</th><th>Commission</th><th>Cash held</th><th>Voids</th></tr></thead>
              <tbody>
                {board.map((b) => (
                  <tr key={b.seller.id}>
                    <td><b>{b.seller.id}</b><div className="tiny muted">{b.seller.name}</div></td>
                    <td>{b.sold}</td>
                    <td>{money(b.commissionCents, raffle.currency)}</td>
                    <td style={b.cashOwedCents >= b.seller.floatLimitCents * 0.8 ? { color: 'var(--warn)', fontWeight: 800 } : undefined}>{money(b.cashOwedCents, raffle.currency)}</td>
                    <td style={b.voidRate > 0.05 ? { color: 'var(--bad)', fontWeight: 800 } : undefined}>{(b.voidRate * 100).toFixed(1)}%{b.voidRate > 0.05 ? ' · flagged' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Latest SMS sent (simulated)</h2>
        <div className="list">
          {sms.map((m) => (
            <div key={m.id} className="list-row small"><span className="mono tiny" style={{ width: 100 }}>{m.to}</span><span className="grow">{m.text}</span><span className="tiny muted">{ago(m.at)}</span></div>
          ))}
        </div>
      </section>
    </>
  )
}
