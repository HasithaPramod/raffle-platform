import { useCallback, useRef, useState } from 'react'
import { dateTime, money, ticketNo } from '../../api/format.js'
import { checkTicket, claimPrize, getCountry, getRaffles, getSettings } from '../../api/server.js'
import { CheckResult } from '../../components/CheckResult.jsx'
import { QrScanner } from '../../components/QrScanner.jsx'
import { Icon, useToast } from '../../components/ui.jsx'
import { useAction, useDb } from '../../hooks.js'
import { readDb } from '../../api/store.js'
import { useSession } from '../../session.jsx'

// Tickets offered in the demo picker (a real POS only scans).
function demoTickets() {
  const d = readDb()
  const raffles = Object.fromEntries(getRaffles().map((r) => [r.id, r]))
  const winners = d.tickets.filter((t) => t.status === 'won' || t.status === 'claimed')
  const others = d.tickets.filter((t) => t.status === 'void').slice(-3)
  return [...winners, ...others].map((t) => ({
    token: t.token,
    label: `${raffles[t.raffleId].title} · ${ticketNo(t.number)} · ${t.status}${t.buyerId ? ' · online buyer' : ''}`,
  }))
}

function CodeBoxes({ value, onChange }) {
  const refs = useRef([])
  const chars = value.padEnd(8, ' ').slice(0, 8).split('')
  function set(i, ch) {
    const clean = ch.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (clean.length > 1) {
      onChange(clean.slice(0, 8))
      refs.current[Math.min(7, clean.length)]?.focus()
      return
    }
    const next = chars.slice()
    next[i] = clean || ' '
    onChange(next.join('').trimEnd())
    if (clean && i < 7) refs.current[i + 1]?.focus()
  }
  return (
    <div className="code-boxes">
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          id={i === 0 ? 'code-first' : undefined}
          aria-label={`Code character ${i + 1}`}
          value={c.trim()}
          placeholder=" "
          maxLength={8}
          autoComplete="off"
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => e.key === 'Backspace' && !c.trim() && i > 0 && refs.current[i - 1]?.focus()}
        />
      ))}
    </div>
  )
}

export default function Scan() {
  useDb()
  const { user } = useSession()
  const toast = useToast()
  const settings = getSettings()
  const [token, setToken] = useState(null)
  const [res, setRes] = useState(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [nic, setNic] = useState('')
  const [done, setDone] = useState(null)
  const [scanKey, setScanKey] = useState(0)
  const { busy, error, setError, run } = useAction()

  const onScan = useCallback(async (t) => {
    setToken(t)
    setDone(null)
    setCode('')
    setRes(await checkTicket({ token: t }))
  }, [])

  function reset() {
    setToken(null)
    setRes(null)
    setDone(null)
    setCode('')
    setName('')
    setNic('')
    setError('')
    setScanKey((k) => k + 1)
  }

  const prize = res?.prize
  const country = res?.raffle ? getCountry(res.raffle.countryId) : null
  const cur = res?.raffle?.currency ?? 'MVR'
  const big = prize && country && prize.valueCents > country.approvalThresholdCents
  const overSellerLimit = prize && country && !big && prize.valueCents > country.sellerPayoutLimitCents

  async function pay(e) {
    e.preventDefault()
    const r = await run(() => claimPrize(user.id, { token, code, claimantName: name, nic }))
    if (!r) return
    if (!r.ok) {
      setError(r.error)
      setRes(await checkTicket({ token }))
      return
    }
    setDone(r)
    toast(r.pendingApproval ? 'Claim sent for Super Admin approval' : `Paid ${money(r.prize.valueCents, cur)}`)
  }

  return (
    <main className="content" style={{ maxWidth: 720 }}>
      {!res && (
        <section className="card flat stack">
          <h2>Scan a ticket</h2>
          <QrScanner key={scanKey} onResult={onScan} demoTickets={demoTickets()} />
        </section>
      )}

      {res && (
        <>
          <CheckResult res={res} staff />
          {res.result !== 'not_genuine' && res.ticket && (
            <section className="card flat stack tight small" aria-label="Checks">
              <div className="row between"><span>QR signature</span><span className="bold" style={{ color: 'var(--good)' }}>✓ Valid</span></div>
              <div className="row between"><span>Sold</span><span className="bold">{res.ticket.sellerId ?? 'Online'} · {dateTime(res.ticket.issuedAt)}</span></div>
              {res.ticket.reprintCount > 0 && <div className="row between"><span>Reprints</span><span className="bold">{res.ticket.reprintCount}</span></div>}
              {prize && <div className="row between"><span>Prize</span><span className="bold">{money(prize.valueCents, cur)}</span></div>}
            </section>
          )}

          {res.result === 'winner' && !done && (
            <form className="card flat stack" onSubmit={pay}>
              <label className="label" htmlFor="code-first">Security code from the ticket</label>
              <CodeBoxes value={code} onChange={setCode} />
              {res.ticket.codeTries > 0 && <div className="tiny bold" style={{ color: 'var(--warn)' }}>{settings.maxCodeTries - res.ticket.codeTries} tries left</div>}
              {big && (
                <>
                  <div className="card flat small" style={{ background: 'var(--warn-soft)' }}>
                    Over {money(country.approvalThresholdCents, cur)}: record the winner's {country.idLabel}. A Super Admin approves and the office pays.
                  </div>
                  <div className="field"><label htmlFor="cname">Winner's name</label><input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div className="field"><label htmlFor="nic">{country.idLabel} number</label><input id="nic" className="input mono" value={nic} onChange={(e) => setNic(e.target.value)} /></div>
                </>
              )}
              {overSellerLimit && user.role === 'seller' && (
                <div className="card flat small" style={{ background: 'var(--warn-soft)' }}>Above your payout limit of {money(country.sellerPayoutLimitCents, cur)}. Send the winner to the office.</div>
              )}
              {error && <div className="error">{error}</div>}
              <button className="btn primary big" disabled={busy || code.length < 8 || (overSellerLimit && user.role === 'seller')} type="submit">
                {big ? 'Submit claim for approval' : `Pay ${money(prize.valueCents, cur)} and mark claimed`}
              </button>
              <div className="hint">Demo: an online buyer's code is on their My tickets page.</div>
            </form>
          )}

          {done && (
            <section className={`result-hero ${done.pendingApproval ? 'warn' : 'good'}`}>
              <div className="row bold"><Icon name="check" /> {done.pendingApproval ? 'Claim submitted' : 'Prize paid'}</div>
              <div className="small">
                {done.pendingApproval
                  ? 'The Super Admin will approve it; the office pays the winner.'
                  : `Ticket marked claimed. ${money(done.prize.valueCents, cur)} was taken from your cash balance.`}
              </div>
            </section>
          )}
          <button className="btn big dark" onClick={reset}><Icon name="scan" /> Scan another ticket</button>
        </>
      )}
    </main>
  )
}
