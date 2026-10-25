import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dateTime, money } from '../../api/format.js'
import { cancelRaffle, createRaffle, getCountries, getCountry, getRaffles, publishRaffle, raffleStats } from '../../api/server.js'
import { ConfirmButton, Modal, RaffleStatus, useToast } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

function toLocalInput(ts) {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

function NewRaffle({ onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const inAWeek = Date.now() + 7 * 86400000
  const countries = getCountries()
  const [f, setF] = useState({
    countryId: countries[0]?.id ?? '',
    fee: '5',
    title: '',
    price: '200',
    total: '10000',
    rate: '10',
    close: toLocalInput(inAWeek - 2 * 3600000),
    draw: toLocalInput(inAWeek),
    youtube: '',
  })
  const [prizes, setPrizes] = useState([{ name: '', value: '', quantity: '1' }])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setPrize = (i, k) => (e) => setPrizes(prizes.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)))
  const country = countries.find((c) => c.id === f.countryId)
  const cur = country?.currency ?? ''
  const free = country?.mode === 'free_entry'

  async function submit(e) {
    e.preventDefault()
    const r = await run(() =>
      createRaffle(user.id, {
        countryId: f.countryId,
        commissionPerEntryCents: Math.round(Number(f.fee) * 100),
        title: f.title,
        priceCents: Math.round(Number(f.price) * 100),
        totalTickets: Number(f.total),
        commissionPct: Number(f.rate),
        salesCloseAt: new Date(f.close).getTime(),
        drawAt: new Date(f.draw).getTime(),
        youtubeUrl: f.youtube,
        prizes: prizes.map((p) => ({ name: p.name, valueCents: Math.round(Number(p.value) * 100), quantity: Number(p.quantity) })),
      }),
    )
    if (r) {
      toast('Draft created. Publish it to start sales.')
      onClose()
    }
  }

  return (
    <Modal title="New raffle" onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="country">Country</label>
          <select id="country" className="input" value={f.countryId} onChange={set('countryId')}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.currency} · {c.mode === 'free_entry' ? 'free entry' : 'paid tickets'}{c.legalStatus !== 'approved' ? ' · legal approval pending' : ''}
              </option>
            ))}
          </select>
          {country && country.legalStatus !== 'approved' && <span className="hint">You can prepare a draft now. It can be published once legal approval is recorded in Countries.</span>}
        </div>
        <div className="field"><label htmlFor="t">Title</label><input id="t" className="input" value={f.title} onChange={set('title')} placeholder="Mega Draw #25" /></div>
        <div className="grid2">
          {free ? (
            <div className="field"><label htmlFor="fee">Seller fee per entry ({cur})</label><input id="fee" className="input" type="number" min="0" step="0.5" value={f.fee} onChange={set('fee')} /><span className="hint">Entries are free. This is what a partner seller earns per entry given with a purchase.</span></div>
          ) : (
            <div className="field"><label htmlFor="p">Ticket price ({cur})</label><input id="p" className="input" type="number" min="1" value={f.price} onChange={set('price')} /></div>
          )}
          <div className="field"><label htmlFor="n">{free ? 'Total entries' : 'Total tickets'}</label><input id="n" className="input" type="number" min="1" max="99999" value={f.total} onChange={set('total')} /></div>
          <div className="field"><label htmlFor="c">Sales close</label><input id="c" className="input" type="datetime-local" value={f.close} onChange={set('close')} /></div>
          <div className="field"><label htmlFor="d">Live draw</label><input id="d" className="input" type="datetime-local" value={f.draw} onChange={set('draw')} /></div>
          {!free && <div className="field"><label htmlFor="r">Default commission (%)</label><input id="r" className="input" type="number" min="0" max="50" step="0.5" value={f.rate} onChange={set('rate')} /></div>}
          <div className="field"><label htmlFor="y">YouTube live link (can add later)</label><input id="y" className="input" value={f.youtube} onChange={set('youtube')} placeholder="https://youtube.com/live/…" /></div>
        </div>
        <fieldset className="stack tight" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Prizes, in draw order (1st prize first)</legend>
          {prizes.map((p, i) => (
            <div key={i} className="row wrap">
              <input aria-label={`Prize ${i + 1} name`} className="input grow" style={{ flex: '2 1 160px' }} placeholder="Prize name" value={p.name} onChange={setPrize(i, 'name')} />
              <input aria-label={`Prize ${i + 1} value in ${cur}`} className="input" style={{ flex: '1 1 110px' }} type="number" placeholder={`Value ${cur}`} value={p.value} onChange={setPrize(i, 'value')} />
              <input aria-label={`Prize ${i + 1} quantity`} className="input" style={{ flex: '0 1 80px' }} type="number" min="1" value={p.quantity} onChange={setPrize(i, 'quantity')} />
              {prizes.length > 1 && <button type="button" className="btn sm" onClick={() => setPrizes(prizes.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          ))}
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPrizes([...prizes, { name: '', value: '', quantity: '1' }])}>Add prize tier</button>
        </fieldset>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} type="submit">Create draft</button>
      </form>
    </Modal>
  )
}

export default function Raffles() {
  useDb()
  const { user } = useSession()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const { busy, error, run } = useAction()
  const raffles = getRaffles().sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <div className="page-head">
        <h1>Raffles</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>New raffle</button>
      </div>
      {error && <div className="error">{error}</div>}
      <section className="card scroll-x">
        <table className="table" style={{ minWidth: 760 }}>
          <thead><tr><th>Raffle</th><th>Country</th><th>Status</th><th>Price</th><th>Sold</th><th>Draw</th><th>Prizes</th><th /></tr></thead>
          <tbody>
            {raffles.map((r) => {
              const s = raffleStats(r.id)
              return (
                <tr key={r.id}>
                  <td><b>{r.title}</b><div className="tiny muted">{r.mode === 'free_entry' ? `${money(r.commissionPerEntryCents, r.currency)} per entry` : `${r.commissionPct}% commission`}</div></td>
                  <td>{getCountry(r.countryId)?.name ?? r.countryId}</td>
                  <td><RaffleStatus status={r.status} /></td>
                  <td>{r.mode === 'free_entry' ? <span className="badge warn">Free entry</span> : money(r.priceCents, r.currency)}</td>
                  <td>{s.sold.toLocaleString()} / {r.totalTickets.toLocaleString()}</td>
                  <td>{dateTime(r.drawAt, r.timezone)}</td>
                  <td className="small">{r.prizes.map((p) => `${p.name} ×${p.quantity}`).join(', ')}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {r.status === 'draft' && (
                        <button className="btn sm dark" disabled={busy} onClick={async () => (await run(async () => { await publishRaffle(user.id, r.id); return true })) && toast('Published: sales are open')}>Publish</button>
                      )}
                      {['on_sale', 'sales_closed', 'live', 'results'].includes(r.status) && <Link className="btn sm" to={`/admin/draw/${r.id}`}>Draw control</Link>}
                      {['draft', 'on_sale'].includes(r.status) && user.role === 'super_admin' && (
                        <ConfirmButton
                          className="btn sm danger"
                          label="Cancel"
                          question="Void all tickets and refund?"
                          confirmLabel="Cancel raffle"
                          disabled={busy}
                          onConfirm={async () => {
                            if (await run(async () => { await cancelRaffle(user.id, r.id); return true })) toast('Raffle cancelled')
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      {creating && <NewRaffle onClose={() => setCreating(false)} />}
    </>
  )
}
