import { useState } from 'react'
import { money } from '../../api/format.js'
import { getCountries, getCountry, getUsers, inviteSeller, payCommission, recordDeposit, sellerBalances, updateSeller } from '../../api/server.js'
import { Modal, useToast } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

function DepositDialog({ seller, onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const bal = sellerBalances(seller.id)
  const [amount, setAmount] = useState(String(Math.max(0, (bal.cashOwedCents - bal.commissionUnpaidCents) / 100)))
  const [ref, setRef] = useState('')
  const { busy, error, run } = useAction()
  async function submit(e) {
    e.preventDefault()
    if (await run(() => recordDeposit(user.id, { sellerId: seller.id, amountCents: Math.round(Number(amount) * 100), reference: ref }))) {
      toast('Deposit recorded. A Super Admin confirms it.')
      onClose()
    }
  }
  return (
    <Modal title={`Record deposit · ${seller.id}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="small muted">Cash held {money(bal.cashOwedCents, bal.currency)} · commission unpaid {money(bal.commissionUnpaidCents, bal.currency)}</div>
        <div className="field"><label htmlFor="amt">Amount (LKR)</label><input id="amt" className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label htmlFor="ref">Bank slip or receipt reference</label><input id="ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} type="submit">Record deposit</button>
      </form>
    </Modal>
  )
}

function EditDialog({ seller, onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const isSuper = user.role === 'super_admin'
  const [rate, setRate] = useState(seller.commissionOverride ?? '')
  const [limit, setLimit] = useState(String(seller.floatLimitCents / 100))
  const [area, setArea] = useState(seller.area)
  const [device, setDevice] = useState(seller.deviceId)
  const [countryId, setCountryId] = useState(seller.countryId)
  const { busy, error, run } = useAction()
  async function submit(e) {
    e.preventDefault()
    const patch = { area, deviceId: device }
    if (isSuper && countryId !== seller.countryId) patch.countryId = countryId
    if (isSuper) {
      patch.commissionOverride = rate === '' ? null : Number(rate)
      patch.floatLimitCents = Math.round(Number(limit) * 100)
    }
    if (await run(async () => { await updateSeller(user.id, seller.id, patch); return true })) {
      toast('Seller updated')
      onClose()
    }
  }
  return (
    <Modal title={`Edit ${seller.id} · ${seller.name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label htmlFor="area">Area</label><input id="area" className="input" value={area} onChange={(e) => setArea(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="s-country">Country</label>
          <select id="s-country" className="input" disabled={!isSuper} value={countryId} onChange={(e) => setCountryId(e.target.value)}>
            {getCountries().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="dev">POS terminal ID</label><input id="dev" className="input" value={device} onChange={(e) => setDevice(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="rate">Personal commission rate (%)</label>
          <input id="rate" className="input" type="number" step="0.5" min="0" max="50" disabled={!isSuper} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Empty = each raffle's default" />
        </div>
        <div className="field">
          <label htmlFor="lim">Cash float limit (LKR)</label>
          <input id="lim" className="input" type="number" min="0" disabled={!isSuper} value={limit} onChange={(e) => setLimit(e.target.value)} />
          {!isSuper && <span className="hint">Only a Super Admin can change rates and limits.</span>}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} type="submit">Save</button>
      </form>
    </Modal>
  )
}

function InviteDialog({ onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const [f, setF] = useState({ name: '', mobile: '', area: '', deviceId: '', countryId: getCountries()[0]?.id ?? '' })
  const { busy, error, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    const s = await run(() => inviteSeller(user.id, f))
    if (s) {
      toast(`${s.id} invited. Demo PIN 1234.`)
      onClose()
    }
  }
  return (
    <Modal title="Invite a seller" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label htmlFor="nm">Name</label><input id="nm" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="mb">Mobile</label><input id="mb" className="input" value={f.mobile} onChange={set('mobile')} /></div>
        <div className="field"><label htmlFor="ar">Area</label><input id="ar" className="input" value={f.area} onChange={set('area')} /></div>
        <div className="field">
          <label htmlFor="inv-country">Country</label>
          <select id="inv-country" className="input" value={f.countryId} onChange={set('countryId')}>
            {getCountries().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="dv">POS terminal ID</label><input id="dv" className="input" value={f.deviceId} onChange={set('deviceId')} placeholder="T-12" /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} type="submit">Invite</button>
      </form>
    </Modal>
  )
}

export default function Sellers() {
  useDb()
  const { user } = useSession()
  const toast = useToast()
  const [dialog, setDialog] = useState(null)
  const { busy, error, run } = useAction()
  const [countryFilter, setCountryFilter] = useState('')
  const sellers = getUsers('seller').filter((s) => !countryFilter || s.countryId === countryFilter)
  const isSuper = user.role === 'super_admin'

  async function pay(s, mode) {
    const amt = await run(() => payCommission(user.id, { sellerId: s.id, mode }))
    if (amt) toast(`${money(amt, sellerBalances(s.id).currency)} commission ${mode === 'net' ? 'netted against cash' : 'marked paid by bank'}`)
  }

  return (
    <>
      <div className="page-head">
        <div className="row wrap">
          <h1>Sellers and cash</h1>
          <label htmlFor="cf" className="sr-only">Country</label>
          <select id="cf" className="input" style={{ width: 'auto' }} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="">All countries</option>
            {getCountries().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn primary" onClick={() => setDialog({ kind: 'invite' })}>Invite seller</button>
      </div>
      {error && <div className="error">{error}</div>}
      <section className="card scroll-x">
        <table className="table" style={{ minWidth: 900 }}>
          <thead><tr><th>Seller</th><th>Country</th><th>Terminal</th><th>Rate</th><th>Cash held</th><th>Limit</th><th>Commission unpaid</th><th>Status</th><th /></tr></thead>
          <tbody>
            {sellers.map((s) => {
              const b = sellerBalances(s.id)
              return (
                <tr key={s.id}>
                  <td><b>{s.id}</b><div className="tiny muted">{s.name} · {s.area}</div></td>
                  <td>{getCountry(s.countryId)?.name ?? '—'}</td>
                  <td>{s.deviceId}</td>
                  <td>{getCountry(s.countryId)?.mode === 'free_entry' ? 'Per-entry fee' : s.commissionOverride != null ? `${s.commissionOverride}% (personal)` : 'Raffle default'}</td>
                  <td style={b.cashOwedCents >= s.floatLimitCents * 0.8 ? { color: 'var(--warn)', fontWeight: 800 } : undefined}>
                    {money(b.cashOwedCents, b.currency)}
                    {b.pendingDepositsCents > 0 && <div className="tiny muted">{money(b.pendingDepositsCents, b.currency)} pending</div>}
                  </td>
                  <td>{money(s.floatLimitCents, b.currency)}</td>
                  <td>{money(b.commissionUnpaidCents, b.currency)}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'good' : 'bad'}`}>{s.status}</span></td>
                  <td>
                    <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setDialog({ kind: 'deposit', seller: s })}>Deposit</button>
                      {isSuper && b.commissionUnpaidCents > 0 && <button className="btn sm" disabled={busy} onClick={() => pay(s, 'net')}>Net commission</button>}
                      {isSuper && b.commissionUnpaidCents > 0 && <button className="btn sm" disabled={busy} onClick={() => pay(s, 'bank')}>Paid by bank</button>}
                      <button className="btn sm" onClick={() => setDialog({ kind: 'edit', seller: s })}>Edit</button>
                      <button
                        className={`btn sm ${s.status === 'active' ? 'danger' : ''}`}
                        disabled={busy}
                        onClick={async () => {
                          const status = s.status === 'active' ? 'suspended' : 'active'
                          if (await run(async () => { await updateSeller(user.id, s.id, { status }); return true })) toast(`${s.id} ${status}`)
                        }}
                      >
                        {s.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <div className="small muted">Commission is a percentage of each ticket's price, fixed at the moment of sale. Pay it after sales close: net it against the cash the seller owes, or mark it paid by bank transfer.</div>
      {dialog?.kind === 'deposit' && <DepositDialog seller={dialog.seller} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <EditDialog seller={dialog.seller} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'invite' && <InviteDialog onClose={() => setDialog(null)} />}
    </>
  )
}
