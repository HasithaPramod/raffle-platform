import { dateTime, prizeLabel, ticketNo } from '../api/format.js'

const COPY = {
  not_genuine: ['bad', 'Not a genuine ticket', 'This QR was not issued by us. Do not accept it.'],
  not_found: ['neutral', 'Ticket not found', 'Check the raffle and the number.'],
  void: ['bad', 'VOID: not valid', 'This ticket was cancelled and cannot win.'],
  claimed: ['warn', 'Prize already claimed', ''],
  claim_pending: ['warn', 'Winner · claim being approved', ''],
  winner: ['good', 'WINNER', 'Take the ticket and its security code to a seller or our office to claim.'],
  no_prize: ['neutral', 'No prize this time', ''],
  in_draw: ['good', 'Genuine · in the draw', ''],
  cancelled: ['bad', 'Raffle cancelled', 'This ticket will be refunded.'],
}

export function CheckResult({ res, staff = false }) {
  if (!res) return null
  const [tone, title, body] = COPY[res.result] ?? ['neutral', res.result, '']
  return (
    <section className={`result-hero ${tone}`} aria-live="polite">
      <div className="bold" style={{ fontSize: 15 }}>{title}</div>
      {res.ticket && <div className="ticket-no" style={{ fontSize: 28 }}>{ticketNo(res.ticket.number)}</div>}
      {res.raffle && (
        <div className="small">
          {res.raffle.title}
          {res.prize ? ` · ${prizeLabel(res.prize, res.raffle.currency)}` : ''}
        </div>
      )}
      {res.claim && <div className="small">Claimed {dateTime(res.claim.at)}{res.claim.paidBy ? ` · paid by ${res.claim.paidBy}` : ''}</div>}
      {body && !(staff && res.result === 'winner') && <div className="small">{body}</div>}
    </section>
  )
}
