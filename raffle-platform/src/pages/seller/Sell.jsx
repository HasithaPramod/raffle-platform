import { useState } from 'react'
import { ago, money, shortTime, ticketNo } from '../../api/format.js'
import { getRaffles, getSettings, getSellerTickets, reprint, sellerBalances, sellPos, voidTicket } from '../../api/server.js'
import { PrintDialog } from '../../components/TicketPrint.jsx'
import { Empty, Icon, Modal, useToast } from '../../components/ui.jsx'
import { useAction, useDb, useNow } from '../../hooks.js'
import { useSession } from '../../session.jsx'

const REASONS = ['Misprint', 'Customer cancelled', 'Duplicate print', 'Wrong raffle']

function VoidDialog({ ticket, late, onClose, onDone }) {
  const { user } = useSession()
  const [reason, setReason] = useState('')
  const [reissue, setReissue] = useState(false)
  const [pin, setPin] = useState('')
  const { busy, error, run } = useAction()
  async function submit(e) {
    e.preventDefault()
    const res = await run(() => voidTicket(user.id, { ticketId: ticket.id, reason, pin, reissue }))
    if (res) onDone(res)
  }
  return (
    <Modal title={`${late ? 'Ask to void' : 'Void'} ticket ${ticketNo(ticket.number)}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {late && <div className="card flat small" style={{ background: 'var(--warn-soft)' }}>Sold more than 5 minutes ago, so an operator must approve this void.</div>}
        <fieldset className="stack tight" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Reason</legend>
          {REASONS.map((r) => (
            <label key={r} className="row card" style={{ padding: '10px 12px', cursor: 'pointer', borderColor: reason === r ? 'var(--ink)' : undefined }}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {r}
            </label>
          ))}
        </fieldset>
        {!late && (
          <label className="row small">
            <input type="checkbox" checked={reissue} onChange={(e) => setReissue(e.target.checked)} />
            Void and reissue: print a new ticket with a new number for the same customer
          </label>
        )}
        <div className="field">
          <label htmlFor="pin">Your PIN</label>
          <input id="pin" className="input mono" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Demo PIN: 1234" />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn danger big" disabled={busy || !reason || !pin} type="submit">
          {late ? 'Send void request' : reissue ? 'Void and print new ticket' : 'Void ticket'}
        </button>
      </form>
    </Modal>
  )
}

export default function Sell() {
  useDb()
  useNow(15000)
  const { user } = useSession()
  const toast = useToast()
  const raffles = getRaffles().filter((r) => r.status === 'on_sale' && r.countryId === user.countryId)
  const [raffleId, setRaffleId] = useState(raffles[0]?.id ?? '')
  const raffle = raffles.find((r) => r.id === raffleId) ?? raffles[0]
  const [qty, setQty] = useState(1)
  const [mobile, setMobile] = useState('')
  const [receipt, setReceipt] = useState('')
  const [printJob, setPrintJob] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const { busy, error, run } = useAction()

  const bal = sellerBalances(user.id)
  const settings = getSettings()
  const usedPct = user.floatLimitCents ? Math.min(100, (bal.cashOwedCents / user.floatLimitCents) * 100) : 0
  const free = raffle?.mode === 'free_entry'
  const handlesCash = user.floatLimitCents > 0 || bal.cashOwedCents !== 0
  const recent = raffle ? getSellerTickets(user.id, raffle.id).slice(0, 8) : []
  const windowMs = settings.voidWindowMinutes * 60 * 1000

  async function sell() {
    const printed = await run(() => sellPos(user.id, { raffleId: raffle.id, qty, mobile, receiptRef: receipt }))
    if (printed) {
      const noun = free ? 'entr' + (printed.length > 1 ? 'ies' : 'y') : 'ticket' + (printed.length > 1 ? 's' : '')
      setPrintJob({ title: `Print ${printed.length} ${noun}`, tickets: printed })
      setQty(1)
      setMobile('')
      setReceipt('')
    }
  }

  async function doReprint(t) {
    const res = await run(() => reprint(user.id, { ticketId: t.id }))
    if (!res) return
    if (res.needsApproval) toast('Already reprinted once. Sent to the office for approval.')
    else setPrintJob({ title: `Reprint ${ticketNo(t.number)}`, tickets: [res.print], note: 'Same ticket and QR, marked REPRINT. No new sale or commission.' })
  }

  return (
    <main className="content">
      <div className="two-col">
      <div className="stack sticky-col">
      {handlesCash && (
      <section className="card flat stack tight" aria-label="Cash float">
        <div className="row between small">
          <span className="bold">Cash to deposit</span>
          <span><b>{money(bal.cashOwedCents, bal.currency)}</b> of {money(user.floatLimitCents, bal.currency)} limit</span>
        </div>
        <div className={`progress ${usedPct >= 80 ? 'warn' : ''}`} style={{ height: 8 }}><div style={{ width: `${usedPct}%` }} /></div>
        {usedPct >= 80 && <div className="tiny bold" style={{ color: 'var(--warn)' }}>Deposit soon: sales stop at the limit</div>}
      </section>
      )}

      {!raffle ? (
        <Empty>No raffle is open in your country right now.</Empty>
      ) : (
        <section className="card flat stack" aria-label="New sale">
          <div className="field">
            <label htmlFor="raffle">Raffle</label>
            <select id="raffle" className="input bold" value={raffle.id} onChange={(e) => setRaffleId(e.target.value)}>
              {raffles.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.mode === 'free_entry' ? 'free entry' : money(r.priceCents, r.currency)}</option>)}
            </select>
          </div>
          <div className="row between">
            <span className="label">{free ? 'Entries for this purchase' : 'Quantity'}</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer tickets" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="More tickets" onClick={() => setQty((q) => Math.min(free ? 5 : 50, q + 1))}>+</button>
            </div>
          </div>
          {free && (
            <div className="field">
              <label htmlFor="receipt">Purchase receipt number</label>
              <input id="receipt" className="input mono" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="e.g. INV-5521" />
              <span className="hint">Free entries are given with a purchase. One receipt gets entries once. No money is taken for the entry.</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="mobile">Customer mobile (optional, for SMS results)</label>
            <input id="mobile" className="input mono" type="tel" placeholder="07X XXX XXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn primary big" disabled={busy} onClick={sell}>
            <Icon name="printer" /> {free ? `Print ${qty} free entr${qty > 1 ? 'ies' : 'y'}` : `Take ${money(raffle.priceCents * qty, raffle.currency)} and print`}
          </button>
        </section>
      )}

      </div>
      <div className="stack">
      {raffle && (
        <section className="card flat" aria-label="Recent sales" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="row between" style={{ padding: '10px 0 6px' }}>
            <span className="label">Recent sales</span>
            <span className="tiny muted">Void alone within {settings.voidWindowMinutes} min</span>
          </div>
          <div className="list">
            {recent.map((t) => {
              const late = Date.now() - t.issuedAt > windowMs
              return (
                <div key={t.id} className="list-row">
                  <div className="grow">
                    <div className="ticket-no" style={{ textDecoration: t.status === 'void' ? 'line-through' : 'none' }}>{ticketNo(t.number)}</div>
                    <div className="tiny muted">
                      {shortTime(t.issuedAt)} · {ago(t.issuedAt)}
                      {t.reprintCount ? ` · reprinted ${t.reprintCount}×` : ''}
                      {t.status === 'void' ? ` · VOID (${t.voidReason})` : ''}
                    </div>
                  </div>
                  {t.status === 'issued' && (
                    <>
                      <button className="btn sm" disabled={busy} onClick={() => doReprint(t)}>Reprint</button>
                      <button className="btn sm danger" onClick={() => setVoiding({ ticket: t, late })}>{late ? 'Ask to void' : 'Void'}</button>
                    </>
                  )}
                </div>
              )
            })}
            {!recent.length && <div className="list-row tiny muted">No sales yet for this raffle.</div>}
          </div>
        </section>
      )}

      </div>
      </div>

      {voiding && (
        <VoidDialog
          ticket={voiding.ticket}
          late={voiding.late}
          onClose={() => setVoiding(null)}
          onDone={(res) => {
            setVoiding(null)
            if (res.needsApproval) toast('Void request sent to the office')
            else
              setPrintJob({
                title: res.replacement ? 'Void slip and new ticket' : 'Print void slip',
                slips: [res.slip],
                tickets: res.replacement ? [res.replacement] : [],
                note: 'The old ticket now scans as VOID. Keep the slip and destroy the old ticket.',
              })
          }}
        />
      )}
      {printJob && <PrintDialog {...printJob} onClose={() => setPrintJob(null)} />}
    </main>
  )
}
