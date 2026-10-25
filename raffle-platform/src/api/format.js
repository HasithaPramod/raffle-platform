// Money is stored as integer minor units (cents, laari…) in the country's
// currency. Every amount is shown with its ISO currency code: "MVR 250".
export function money(cents, currency = 'MVR', { decimals = false } = {}) {
  const v = (cents ?? 0) / 100
  return `${currency} ` + v.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 })
}

export function moneyShort(cents, currency = 'MVR') {
  const v = (cents ?? 0) / 100
  if (Math.abs(v) >= 1_000_000) return `${currency} ` + (v / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  return money(cents, currency)
}

export function ticketNo(n) {
  const s = String(n).padStart(5, '0')
  return s.slice(0, 2) + ' ' + s.slice(2)
}

export function parseTicketNo(str) {
  const digits = String(str).replace(/\D/g, '')
  return digits ? Number(digits) : NaN
}

// Times are shown in the raffle's country time zone when one is given.
export function dateTime(ts, timeZone) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
}

export function shortTime(ts, timeZone) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

// "26-10-26 20:41" for printed slips.
export function slipStamp(ts, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`
}

export function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function countdown(ts) {
  let s = Math.max(0, Math.floor((ts - Date.now()) / 1000))
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return { d, h, m, s }
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export const STATUS_LABEL = {
  draft: 'Draft',
  on_sale: 'On sale',
  sales_closed: 'Sales closed',
  live: 'Live draw',
  results: 'Results out',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

// "Car (LKR 6,500,000)", but "Cash LKR 5,000" stays as it is.
export function prizeLabel(p, currency = 'MVR') {
  if (!p) return ''
  return p.name.toUpperCase().includes(currency) ? p.name : `${p.name} (${money(p.valueCents, currency)})`
}

export function youtubeEmbed(url) {
  if (!url) return null
  const m = String(url).match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/)([A-Za-z0-9_-]{6,})/)
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : null
}
