import { createPortal } from 'react-dom'
import { money, slipStamp, ticketNo } from '../api/format.js'
import { QrImage } from './QrImage.jsx'
import { DEMO } from '../env.js'
import { Icon, Modal } from './ui.jsx'

import { BRAND as B } from '../brand.js'

const BRAND = B.name.toUpperCase()


// 58 mm thermal ticket. The same markup is used for the on-screen preview and
// for printing (ESC/POS on a POS terminal, or the browser print dialog).
export function ThermalTicket({ t }) {
  return (
    <div className="thermal">
      <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em' }}>{BRAND}</div>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{t.raffleTitle.toUpperCase()}</div>
      <div className="center">DRAW {slipStamp(t.drawAt, t.timezone)}<br />LIVE ON YOUTUBE</div>
      {t.reprintCount > 0 && <div className="stamp">REPRINT {t.reprintCount}{t.reprintAt ? ` · ${slipStamp(t.reprintAt, t.timezone).slice(9)}` : ''}</div>}
      <div className="rule" />
      <div>TICKET NO.</div>
      <div className="big">{ticketNo(t.number)}</div>
      {t.mode === 'free_entry' ? (
        <div style={{ fontWeight: 700, fontSize: 11, textAlign: 'center' }}>FREE ENTRY · NO PURCHASE NEEDED{t.receiptRef ? <><br />WITH RECEIPT {t.receiptRef}</> : null}</div>
      ) : (
        <div style={{ fontWeight: 700, fontSize: 11 }}>PRICE {money(t.priceCents, t.currency, { decimals: true })}</div>
      )}
      <QrImage value={t.token} size={128} label={`Signed QR for ticket ${ticketNo(t.number)}`} />
      <div className="code">
        <div style={{ fontSize: 9 }}>SECURITY CODE · KEEP COVERED</div>
        <b>{t.code}</b>
      </div>
      <div className="rule" />
      <div className="kv"><span>SELLER</span><span>{t.sellerId ?? 'ONLINE'}</span></div>
      <div className="kv"><span>TERMINAL</span><span>{t.deviceId ?? 'WEB'}</span></div>
      <div className="kv"><span>SOLD</span><span>{slipStamp(t.issuedAt, t.timezone)}</span></div>
      <div className="kv"><span>SERIAL</span><span>{t.serial}</span></div>
      <div className="rule" />
      <div className="center" style={{ fontSize: 9 }}>
        Claim within {t.claimDays} days of the draw.<br />
        {t.idLabel} needed for prizes over {money(t.nicAboveCents, t.currency)}.<br />
        Check results: [yoursite.lk]
      </div>
    </div>
  )
}

export function VoidSlip({ slip }) {
  return (
    <div className="thermal">
      <div style={{ fontSize: 14, fontWeight: 800 }}>{BRAND}</div>
      <div className="stamp" style={{ fontSize: 16 }}>VOID</div>
      <div className="rule" />
      <div className="kv"><span>RAFFLE</span><span>{slip.raffleTitle}</span></div>
      <div className="kv"><span>TICKET</span><span>{ticketNo(slip.number)}</span></div>
      <div className="kv"><span>REASON</span><span>{slip.reason}</span></div>
      <div className="kv"><span>SERIAL</span><span>{slip.serial}</span></div>
      <div className="kv"><span>SELLER</span><span>{slip.sellerId}</span></div>
      <div className="kv"><span>TIME</span><span>{slipStamp(slip.at, slip.timezone)}</span></div>
      <div className="rule" />
      <div className="center" style={{ fontSize: 9 }}>Ticket {ticketNo(slip.number)} is no longer valid.<br />Keep this slip. Destroy the ticket.</div>
    </div>
  )
}

export function PrintDialog({ title, tickets = [], slips = [], note, onClose }) {
  const items = (
    <>
      {slips.map((s) => <VoidSlip key={'v' + s.serial} slip={s} />)}
      {tickets.map((t) => <ThermalTicket key={t.id + (t.reprintCount ?? 0)} t={t} />)}
    </>
  )
  return (
    <Modal title={title} onClose={onClose}>
      {note && <div className="small">{note}</div>}
      <div className="print-preview">{items}</div>
      <div className="row">
        {DEMO ? (
          <div className="card flat small grow" style={{ background: 'var(--accent-soft)' }}>Demo page: printing is turned off here. In the app this sends the slip to the POS printer.</div>
        ) : (
        <button className="btn primary grow" onClick={() => window.print()}>
          <Icon name="printer" /> Print {tickets.length + slips.length > 1 ? `${tickets.length + slips.length} slips` : ''}
        </button>
        )}
        <button className="btn" onClick={onClose}>Done</button>
      </div>
      <div className="hint">On a POS terminal this prints through the printer SDK. In a browser, choose your 58 mm thermal printer in the print dialog.</div>
      {createPortal(<div className="print-sheet">{items}</div>, document.body)}
    </Modal>
  )
}
