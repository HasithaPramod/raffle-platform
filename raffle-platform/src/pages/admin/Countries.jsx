import { useState } from 'react'
import { dateTime, money } from '../../api/format.js'
import { createCountry, getCountries, getRaffles, getUsers, setCountryLegal, updateCountry } from '../../api/server.js'
import { Modal, useToast } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

const ZONES = ['Asia/Colombo', 'Indian/Maldives', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Europe/London', 'Africa/Nairobi']

const MODES = {
  paid: ['Paid tickets', 'Buyers pay for each ticket. Sellers collect cash and earn a percentage.'],
  free_entry: ['Free entry', 'Nobody pays to enter. Entries come free with a purchase or once a day online. Sellers earn a fixed fee per entry.'],
}

const toMajor = (cents) => String((cents ?? 0) / 100)
const toMinor = (v) => Math.round(Number(v || 0) * 100)

function CountryForm({ existing, onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const [f, setF] = useState({
    name: existing?.name ?? '',
    code: existing?.code ?? '',
    currency: existing?.currency ?? '',
    timezone: existing?.timezone ?? '',
    languages: existing?.languages?.join(', ') ?? '',
    mode: existing?.mode ?? 'free_entry',
    idLabel: existing?.idLabel ?? '',
    approval: toMajor(existing?.approvalThresholdCents ?? 0),
    payout: toMajor(existing?.sellerPayoutLimitCents ?? 0),
    float: toMajor(existing?.defaultFloatLimitCents ?? 0),
    paymentGateway: existing?.paymentGateway ?? '',
    smsProvider: existing?.smsProvider ?? '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const cur = f.currency.toUpperCase() || 'currency'

  async function submit(e) {
    e.preventDefault()
    const data = {
      name: f.name,
      currency: f.currency,
      timezone: f.timezone,
      languages: f.languages,
      mode: f.mode,
      idLabel: f.idLabel,
      approvalThresholdCents: toMinor(f.approval),
      sellerPayoutLimitCents: toMinor(f.payout),
      defaultFloatLimitCents: f.mode === 'paid' ? toMinor(f.float) : 0,
      paymentGateway: f.paymentGateway,
      smsProvider: f.smsProvider,
    }
    const ok = await run(async () => {
      if (existing) await updateCountry(user.id, existing.id, data)
      else await createCountry(user.id, { ...data, code: f.code })
      return true
    })
    if (ok) {
      toast(existing ? `${f.name} saved` : `${f.name} added. Record legal approval, then switch it on.`)
      onClose()
    }
  }

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add a country'} onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        {!existing && <div className="card flat small" style={{ background: 'var(--accent-soft)' }}>New countries start switched off, with legal approval pending. Nothing can be sold there until you record approval and switch it on.</div>}
        <div className="grid2">
          <div className="field"><label htmlFor="c-name">Country name</label><input id="c-name" className="input" value={f.name} onChange={set('name')} placeholder="Maldives" /></div>
          <div className="field">
            <label htmlFor="c-code">Country code (2 letters)</label>
            <input id="c-code" className="input mono" maxLength={2} value={f.code} onChange={set('code')} disabled={!!existing} placeholder="MV" style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="field"><label htmlFor="c-cur">Currency (3 letters)</label><input id="c-cur" className="input mono" maxLength={3} value={f.currency} onChange={set('currency')} placeholder="MVR" style={{ textTransform: 'uppercase' }} /></div>
          <div className="field">
            <label htmlFor="c-tz">Time zone</label>
            <input id="c-tz" className="input" list="tz-list" value={f.timezone} onChange={set('timezone')} placeholder="Indian/Maldives" />
            <datalist id="tz-list">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </div>
          <div className="field"><label htmlFor="c-lang">Languages</label><input id="c-lang" className="input" value={f.languages} onChange={set('languages')} placeholder="Dhivehi, English" /></div>
          <div className="field"><label htmlFor="c-id">ID document winners show</label><input id="c-id" className="input" value={f.idLabel} onChange={set('idLabel')} placeholder="National ID card" /></div>
        </div>
        <fieldset className="stack tight" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>How draws work here</legend>
          {Object.entries(MODES).map(([key, [title, body]]) => (
            <label key={key} className="card row" style={{ cursor: 'pointer', alignItems: 'flex-start', borderColor: f.mode === key ? 'var(--ink)' : undefined }}>
              <input type="radio" name="mode" value={key} checked={f.mode === key} onChange={set('mode')} style={{ marginTop: 3 }} />
              <span><span className="bold" style={{ display: 'block' }}>{title}</span><span className="small muted">{body}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="grid2">
          <div className="field"><label htmlFor="c-appr">Super Admin approval above ({cur})</label><input id="c-appr" className="input" type="number" min="0" value={f.approval} onChange={set('approval')} /><span className="hint">Bigger prizes need the winner's ID and approval.</span></div>
          <div className="field"><label htmlFor="c-pay">Seller can pay prizes up to ({cur})</label><input id="c-pay" className="input" type="number" min="0" value={f.payout} onChange={set('payout')} /></div>
          {f.mode === 'paid' && <div className="field"><label htmlFor="c-float">Default seller cash limit ({cur})</label><input id="c-float" className="input" type="number" min="0" value={f.float} onChange={set('float')} /></div>}
          <div className="field"><label htmlFor="c-pg">Payment gateway</label><input id="c-pg" className="input" value={f.paymentGateway} onChange={set('paymentGateway')} placeholder={f.mode === 'paid' ? 'Gateway name' : 'Not needed for free entry'} /></div>
          <div className="field"><label htmlFor="c-sms">SMS provider</label><input id="c-sms" className="input" value={f.smsProvider} onChange={set('smsProvider')} /></div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} type="submit">{existing ? 'Save changes' : 'Add country'}</button>
      </form>
    </Modal>
  )
}

function LegalForm({ country, onClose }) {
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const [ref, setRef] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const approved = country.legalStatus === 'approved'

  async function save(approve) {
    const ok = await run(async () => {
      await setCountryLegal(user.id, country.id, { approved: approve, reference: ref })
      return true
    })
    if (ok) {
      toast(approve ? `Legal approval recorded for ${country.name}` : `Approval withdrawn for ${country.name}`)
      onClose()
    }
  }

  return (
    <Modal title={`Legal approval · ${country.name}`} onClose={onClose}>
      {approved ? (
        <div className="stack">
          <div className="card flat small" style={{ background: 'var(--good-soft)' }}>
            Approved {dateTime(country.legalAt)} by {country.legalBy}.<br />Reference: <b>{country.legalRef}</b>
          </div>
          <div className="small muted">Withdrawing stops new raffles from being published here. Raffles already on sale continue unless you switch the country off.</div>
          {error && <div className="error">{error}</div>}
          <button className="btn danger" disabled={busy} onClick={() => save(false)}>Withdraw approval</button>
        </div>
      ) : (
        <div className="stack">
          <div className="small">
            Record the legal opinion, licence or permit that allows <b>{MODES[country.mode][0].toLowerCase()}</b> draws in {country.name}. Raffles can be published there only after this is recorded.
          </div>
          <div className="field">
            <label htmlFor="legal-ref">Legal opinion or licence reference</label>
            <input id="legal-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Opinion from [law firm], 12 Nov 2026" />
          </div>
          <label className="row small" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
            A qualified lawyer or the regulator has confirmed this draw model is allowed in {country.name}.
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn dark big" disabled={busy || !confirmed || !ref.trim()} onClick={() => save(true)}>Record approval</button>
        </div>
      )}
    </Modal>
  )
}

export default function Countries() {
  useDb()
  const { user } = useSession()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const [dialog, setDialog] = useState(null)
  const isSuper = user.role === 'super_admin'
  const countries = getCountries()
  const raffles = getRaffles()
  const sellers = getUsers('seller')

  async function toggle(c) {
    const ok = await run(async () => {
      await updateCountry(user.id, c.id, { enabled: !c.enabled })
      return true
    })
    if (ok) toast(c.enabled ? `${c.name} switched off: sales paused` : `${c.name} switched on`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Countries</h1>
          <div className="small muted">Each country has its own currency, rules and legal approval. Raffles, sellers and buyers belong to one country.</div>
        </div>
        {isSuper && <button className="btn primary" onClick={() => setDialog({ kind: 'add' })}>Add country</button>}
      </div>
      {!isSuper && <div className="card flat small" style={{ background: 'var(--line-soft)' }}>Only a Super Admin can add or change countries.</div>}
      {error && <div className="error">{error}</div>}
      <section className="card scroll-x">
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr><th>Country</th><th>Draw type</th><th>Currency</th><th>Limits</th><th>Legal approval</th><th>Sales</th><th>Use</th><th /></tr>
          </thead>
          <tbody>
            {countries.map((c) => {
              const nRaffles = raffles.filter((r) => r.countryId === c.id).length
              const nSellers = sellers.filter((s) => s.countryId === c.id).length
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b> <span className="mono tiny muted">{c.code}</span>
                    <div className="tiny muted">{c.timezone} · {c.languages.join(', ')}</div>
                  </td>
                  <td><span className={`badge ${c.mode === 'paid' ? 'ink' : 'warn'}`}>{MODES[c.mode][0]}</span></td>
                  <td className="mono">{c.currency}</td>
                  <td className="tiny">
                    Approval over {money(c.approvalThresholdCents, c.currency)}
                    <div className="muted">Sellers pay up to {money(c.sellerPayoutLimitCents, c.currency)} · ID: {c.idLabel}</div>
                  </td>
                  <td>
                    {c.legalStatus === 'approved' ? (
                      <>
                        <span className="badge good">Approved</span>
                        <div className="tiny muted" style={{ maxWidth: 220, marginTop: 4 }}>{c.legalRef}</div>
                      </>
                    ) : (
                      <span className="badge bad">Pending</span>
                    )}
                  </td>
                  <td><span className={`badge ${c.enabled ? 'good' : ''}`}>{c.enabled ? 'On' : 'Off'}</span></td>
                  <td className="tiny">{nRaffles} raffle{nRaffles === 1 ? '' : 's'}<div className="muted">{nSellers} seller{nSellers === 1 ? '' : 's'}</div></td>
                  <td>
                    {isSuper && (
                      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => setDialog({ kind: 'edit', country: c })}>Edit</button>
                        <button className="btn sm" onClick={() => setDialog({ kind: 'legal', country: c })}>Legal</button>
                        <button className={`btn sm ${c.enabled ? 'danger' : 'dark'}`} disabled={busy} onClick={() => toggle(c)}>{c.enabled ? 'Switch off' : 'Switch on'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <div className="small muted">Switching a country off pauses all sales and entries there at once. The draw type and currency are locked while raffles are running or exist.</div>
      {dialog?.kind === 'add' && <CountryForm onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <CountryForm existing={dialog.country} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'legal' && <LegalForm country={dialog.country} onClose={() => setDialog(null)} />}
    </>
  )
}
