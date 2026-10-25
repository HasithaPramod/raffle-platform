// Mock backend. Every function here maps to one endpoint of the real API
// (see README "API map"). Writes run inside tx(): a lock plus a draft copy of
// the database that is saved only if the whole operation succeeds, which is
// how the real service uses a PostgreSQL transaction with row locks.

import {
  decryptText,
  encryptText,
  generateKeys,
  pickWinners,
  randomBytes,
  randomCode,
  sha256Hex,
  signTicketToken,
  toHex,
  uuid,
  verifyTicketToken,
} from './crypto.js'
import { ticketNo } from './format.js'
import { readDb, resetDb, writeDb } from './store.js'

export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const fail = (code, message) => {
  throw new ApiError(code, message)
}

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

// ---------------------------------------------------------------------------
// transactions

let chain = Promise.resolve()
function withLock(fn) {
  const run = chain.then(() => fn())
  chain = run.catch(() => {})
  return run
}

async function tx(fn) {
  return withLock(async () => {
    const draft = structuredClone(readDb())
    const result = await fn(draft)
    writeDb(draft)
    return result
  })
}

let initPromise = null
export function init() {
  if (readDb()) return Promise.resolve()
  if (!initPromise) {
    initPromise = withLock(async () => {
      if (!readDb()) writeDb(await buildSeedDb())
    }).finally(() => {
      initPromise = null
    })
  }
  return initPromise
}

export async function resetDemo() {
  resetDb()
  await init()
}

// ---------------------------------------------------------------------------
// helpers

function userIn(d, id) {
  return d.users.find((u) => u.id === id)
}

function requireRole(d, actorId, roles) {
  const u = userIn(d, actorId)
  if (!u) fail('auth', 'Please log in.')
  if (u.status !== 'active') fail('suspended', 'This account is suspended.')
  if (!roles.includes(u.role)) fail('forbidden', 'You do not have permission for this action.')
  return u
}

function raffleIn(d, id) {
  const r = d.raffles.find((x) => x.id === id)
  if (!r) fail('not_found', 'Raffle not found.')
  return r
}

function ticketIn(d, id) {
  const t = d.tickets.find((x) => x.id === id)
  if (!t) fail('not_found', 'Ticket not found.')
  return t
}

async function audit(d, actorId, action, entity, entityId, detail = {}) {
  const prevHash = d.audit.length ? d.audit[d.audit.length - 1].hash : 'GENESIS'
  const entry = { id: d.audit.length + 1, at: Date.now(), actorId, action, entity, entityId, detail }
  const hash = await sha256Hex(prevHash + JSON.stringify(entry))
  d.audit.push({ ...entry, prevHash, hash })
}

function ledger(d, account, amountCents, { sellerId = null, ticketId = null, memo = '' } = {}) {
  if (!amountCents) return
  d.ledger.push({ id: uuid(), at: Date.now(), account, sellerId, ticketId, amountCents, memo })
}

function sms(d, to, text) {
  if (to) d.sms.push({ id: uuid(), at: Date.now(), to, text })
}

function countryIn(d, id) {
  const c = d.countries.find((x) => x.id === id)
  if (!c) fail('not_found', 'Country not found.')
  return c
}

function commissionRate(seller, raffle) {
  return seller?.commissionOverride ?? raffle.commissionPct
}

function takenNumbers(d, raffleId) {
  const now = Date.now()
  const set = new Set(d.tickets.filter((t) => t.raffleId === raffleId).map((t) => t.number))
  d.holds.filter((h) => h.raffleId === raffleId && h.expiresAt > now).forEach((h) => h.numbers.forEach((n) => set.add(n)))
  return set
}

function pickFree(d, raffle, qty, picks = []) {
  const taken = takenNumbers(d, raffle.id)
  const out = []
  for (const p of picks) {
    if (!Number.isInteger(p) || p < 1 || p > raffle.totalTickets) fail('bad_number', `Number ${p} is not in this raffle.`)
    if (taken.has(p) || out.includes(p)) fail('number_taken', `Number ${p} is already taken.`)
    out.push(p)
  }
  const free = raffle.totalTickets - taken.size - out.length
  if (qty - out.length > free) fail('sold_out', 'Not enough tickets left.')
  let guard = 0
  while (out.length < qty) {
    const n = 1 + Math.floor(Math.random() * raffle.totalTickets)
    if (!taken.has(n) && !out.includes(n)) out.push(n)
    if (++guard > 1_000_000) fail('sold_out', 'Not enough tickets left.')
  }
  return out
}

function requireOnSale(d, raffle) {
  const c = d.countries.find((x) => x.id === raffle.countryId)
  if (!c?.enabled) fail('country_off', 'Sales are paused in this country.')
  if (raffle.status !== 'on_sale') fail('not_on_sale', 'Sales are closed for this raffle.')
  if (Date.now() > raffle.salesCloseAt) fail('not_on_sale', 'Sales are closed for this raffle.')
}

async function hashCode(code, salt) {
  return sha256Hex(salt + ':' + code) // production: Argon2id
}

// Creates one ticket inside a transaction. Returns the ticket plus the
// plaintext security code (only ever returned at issue/print time).
async function issueTicket(d, raffle, { number, channel, sellerId = null, buyerId = null, mobile = null, deviceId = null, receiptRef = null }) {
  const keys = d.keyring[d.keyring.length - 1]
  const id = uuid()
  const code = randomCode(8)
  const salt = toHex(randomBytes(8))
  raffle.nextSerial += 1
  const ticket = {
    id,
    raffleId: raffle.id,
    number,
    channel,
    sellerId,
    buyerId,
    deviceId,
    mobile,
    priceCents: raffle.priceCents,
    codeSalt: salt,
    codeHash: await hashCode(code, salt),
    codeEnc: await encryptText(keys, code), // lets the owner view it and a reprint show it
    token: await signTicketToken(keys, { tid: id, rid: raffle.id }),
    status: 'issued',
    issuedAt: Date.now(),
    reprintCount: 0,
    reprintAllowance: 1,
    serial: `${raffle.code}-${deviceId ?? 'WEB'}-${String(raffle.nextSerial).padStart(6, '0')}`,
    prizeId: null,
    claimPending: null,
    codeTries: 0,
    receiptRef,
  }
  d.tickets.push(ticket)

  const seller = sellerId ? userIn(d, sellerId) : null
  if (raffle.mode === 'free_entry') {
    // No money for the entry itself. A partner seller earns a fixed amount
    // per entry given out with a real purchase; it is a promotion cost.
    const perEntry = seller && channel === 'pos' ? raffle.commissionPerEntryCents : 0
    if (perEntry) {
      ledger(d, 'seller_commission', perEntry, { sellerId, ticketId: id, memo: 'Per-entry fee' })
      ledger(d, 'promotion_cost', perEntry, { ticketId: id, memo: 'Per-entry fee' })
    }
    return { ticket, code }
  }
  const commission = seller ? Math.round((raffle.priceCents * commissionRate(seller, raffle)) / 100) : 0
  if (channel === 'pos') ledger(d, 'seller_cash', raffle.priceCents, { sellerId, ticketId: id, memo: 'Ticket cash collected' })
  if (commission) ledger(d, 'seller_commission', commission, { sellerId, ticketId: id, memo: `Commission ${commissionRate(seller, raffle)}%` })
  ledger(d, 'platform_revenue', raffle.priceCents - commission, { ticketId: id, memo: 'Ticket sale' })
  return { ticket, code }
}

function printView(d, t, code, extra = {}) {
  const raffle = raffleIn(d, t.raffleId)
  return {
    id: t.id,
    number: t.number,
    token: t.token,
    code,
    raffleTitle: raffle.title,
    drawAt: raffle.drawAt,
    priceCents: t.priceCents,
    sellerId: t.sellerId,
    deviceId: t.deviceId,
    issuedAt: t.issuedAt,
    serial: t.serial,
    reprintCount: t.reprintCount,
    claimDays: d.settings.claimDays,
    nicAboveCents: countryIn(d, raffle.countryId).approvalThresholdCents,
    idLabel: countryIn(d, raffle.countryId).idLabel,
    currency: raffle.currency,
    timezone: raffle.timezone,
    mode: raffle.mode,
    receiptRef: t.receiptRef,
    ...extra,
  }
}

async function reverseTicket(d, t, memo) {
  d.ledger
    .filter((l) => l.ticketId === t.id && l.amountCents !== 0 && !l.reversed)
    .forEach((l) => {
      l.reversed = true
      ledger(d, l.account, -l.amountCents, { sellerId: l.sellerId, ticketId: t.id, memo })
    })
}

// ---------------------------------------------------------------------------
// reads (synchronous, from the current snapshot)

function publicRaffle(r) {
  const { seed, ...rest } = r
  return { ...rest, seed: r.seedRevealed ? seed : null }
}

export function getRaffles() {
  return (readDb()?.raffles ?? []).map(publicRaffle)
}

export function getRaffle(id) {
  const r = readDb()?.raffles.find((x) => x.id === id)
  return r ? publicRaffle(r) : null
}

export function raffleStats(raffleId) {
  const tickets = readDb().tickets.filter((t) => t.raffleId === raffleId && t.status !== 'void')
  return {
    sold: tickets.length,
    pos: tickets.filter((t) => t.channel === 'pos').length,
    online: tickets.filter((t) => t.channel === 'online').length,
  }
}

export function getCountries() {
  return readDb()?.countries ?? []
}

export function getCountry(id) {
  return readDb()?.countries.find((c) => c.id === id) ?? null
}

export function countryForUser(user) {
  return user?.countryId ? getCountry(user.countryId) : null
}

export function getUsers(role) {
  const users = readDb()?.users ?? []
  return role ? users.filter((u) => u.role === role) : users
}

export function getUser(id) {
  return readDb()?.users.find((u) => u.id === id) ?? null
}

export function getSettings() {
  return readDb().settings
}

function safeTicket(t) {
  const { codeHash, codeSalt, codeEnc, ...rest } = t
  return rest
}

export function getBuyerTickets(buyerId) {
  return readDb()
    .tickets.filter((t) => t.buyerId === buyerId)
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .map(safeTicket)
}

export function getSellerTickets(sellerId, raffleId) {
  return readDb()
    .tickets.filter((t) => t.sellerId === sellerId && (!raffleId || t.raffleId === raffleId))
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .map(safeTicket)
}

export function sellerBalances(sellerId) {
  const d = readDb()
  const sum = (account) => d.ledger.filter((l) => l.sellerId === sellerId && l.account === account).reduce((a, l) => a + l.amountCents, 0)
  const pendingDeposits = d.deposits.filter((x) => x.sellerId === sellerId && x.status === 'pending').reduce((a, x) => a + x.amountCents, 0)
  const seller = userIn(d, sellerId)
  const currency = d.countries.find((c) => c.id === seller?.countryId)?.currency ?? 'LKR'
  return { cashOwedCents: sum('seller_cash'), commissionUnpaidCents: sum('seller_commission'), pendingDepositsCents: pendingDeposits, currency }
}

export function sellerRaffleSummary(sellerId) {
  const d = readDb()
  const seller = userIn(d, sellerId)
  return d.raffles
    .map((r) => {
      const sold = d.tickets.filter((t) => t.sellerId === sellerId && t.raffleId === r.id && t.status !== 'void')
      const voids = d.tickets.filter((t) => t.sellerId === sellerId && t.raffleId === r.id && t.status === 'void').length
      const commission = raffleCommission(d, r.id, sellerId)
      return { raffle: publicRaffle(r), sold: sold.length, voids, rate: commissionRate(seller, r), commissionCents: commission }
    })
    .filter((x) => x.sold > 0 || x.voids > 0)
}

function raffleCommission(d, raffleId, sellerId = null) {
  return d.ledger
    .filter((l) => l.account === 'seller_commission' && (!sellerId || l.sellerId === sellerId) && d.tickets.find((t) => t.id === l.ticketId)?.raffleId === raffleId)
    .reduce((a, l) => a + l.amountCents, 0)
}

export function sellerLeaderboard(raffleId) {
  const d = readDb()
  const raffle = d.raffles.find((r) => r.id === raffleId)
  return d.users
    .filter((u) => u.role === 'seller' && u.countryId === raffle?.countryId)
    .map((s) => {
      const mine = d.tickets.filter((t) => t.sellerId === s.id && t.raffleId === raffleId)
      const sold = mine.filter((t) => t.status !== 'void').length
      const voids = mine.length - sold
      return {
        seller: s,
        sold,
        voidRate: mine.length ? voids / mine.length : 0,
        commissionCents: raffleCommission(d, raffleId, s.id),
        ...sellerBalances(s.id),
      }
    })
    .sort((a, b) => b.sold - a.sold)
}

export function platformStats(raffleId) {
  const d = readDb()
  const raffle = d.raffles.find((r) => r.id === raffleId)
  const stats = raffleStats(raffleId)
  const commission = raffleCommission(d, raffleId)
  const sellers = d.users.filter((u) => u.role === 'seller' && u.countryId === raffle?.countryId)
  const cashWithSellers = sellers.reduce((a, s) => a + sellerBalances(s.id).cashOwedCents, 0)
  const nearLimit = sellers.filter((s) => sellerBalances(s.id).cashOwedCents >= s.floatLimitCents * 0.8).length
  return { ...stats, total: raffle?.totalTickets ?? 0, salesCents: stats.sold * (raffle?.priceCents ?? 0), commissionCents: commission, cashWithSellers, nearLimit }
}

function currencyOfTicket(d, t) {
  return d.raffles.find((r) => r.id === t?.raffleId)?.currency ?? 'LKR'
}

export function getApprovals() {
  const d = readDb()
  const items = []
  d.requests
    .filter((r) => r.status === 'pending')
    .forEach((r) => {
      const t = d.tickets.find((x) => x.id === r.ticketId)
      items.push({ kind: r.type, id: r.id, at: r.at, ticket: t && safeTicket(t), sellerId: r.sellerId, reason: r.reason, currency: currencyOfTicket(d, t) })
    })
  d.claims
    .filter((c) => c.status === 'pending_approval')
    .forEach((c) => {
      const t = d.tickets.find((x) => x.id === c.ticketId)
      items.push({ kind: 'claim', id: c.id, at: c.at, ticket: t && safeTicket(t), claim: c, currency: currencyOfTicket(d, t), idLabel: d.countries.find((x) => x.id === d.raffles.find((r) => r.id === t?.raffleId)?.countryId)?.idLabel ?? 'ID' })
    })
  d.deposits
    .filter((x) => x.status === 'pending')
    .forEach((x) => items.push({ kind: 'deposit', id: x.id, at: x.at, sellerId: x.sellerId, deposit: x, currency: d.countries.find((c) => c.id === userIn(d, x.sellerId)?.countryId)?.currency ?? 'LKR' }))
  d.tickets
    .filter((t) => t.codeTries >= d.settings.maxCodeTries)
    .forEach((t) => items.push({ kind: 'locked', id: t.id, at: t.issuedAt, ticket: safeTicket(t) }))
  return items.sort((a, b) => b.at - a.at)
}

export function getAudit() {
  return [...(readDb()?.audit ?? [])].reverse()
}

export function getSms() {
  return [...(readDb()?.sms ?? [])].reverse()
}

export function prizeName(raffle, prizeId) {
  return raffle?.prizes.find((p) => p.id === prizeId) ?? null
}

// ---------------------------------------------------------------------------
// buyer

export function holdNumbers(actorId, { raffleId, qty, picks = [] }) {
  return tx(async (d) => {
    const u = requireRole(d, actorId, ['buyer'])
    const raffle = raffleIn(d, raffleId)
    requireOnSale(d, raffle)
    if (raffle.mode === 'free_entry') fail('free_entry', 'This draw is free to enter. Use Enter free.')
    if (!(qty >= 1 && qty <= 20)) fail('bad_qty', 'Choose between 1 and 20 tickets.')
    d.holds = d.holds.filter((h) => h.expiresAt > Date.now() && h.userId !== u.id)
    const numbers = pickFree(d, raffle, qty, picks)
    const hold = { id: uuid(), raffleId, userId: u.id, numbers, expiresAt: Date.now() + d.settings.holdMinutes * MIN }
    d.holds.push(hold)
    return hold
  })
}

export function releaseHold(actorId, holdId) {
  return tx(async (d) => {
    d.holds = d.holds.filter((h) => !(h.id === holdId && h.userId === actorId))
  })
}

// Free-entry draws: anyone can enter online without paying, limited per day.
export function enterFree(actorId, { raffleId }) {
  return tx(async (d) => {
    const u = requireRole(d, actorId, ['buyer'])
    const raffle = raffleIn(d, raffleId)
    requireOnSale(d, raffle)
    if (raffle.mode !== 'free_entry') fail('paid', 'This draw needs a ticket.')
    const since = Date.now() - DAY
    const today = d.tickets.filter((t) => t.raffleId === raffle.id && t.buyerId === u.id && t.channel === 'online' && t.issuedAt > since).length
    if (today >= d.settings.freeEntriesPerDay) fail('limit', 'You have used your free entry for today. Try again tomorrow.')
    const [number] = pickFree(d, raffle, 1)
    const { ticket } = await issueTicket(d, raffle, { number, channel: 'online', buyerId: u.id, mobile: u.mobile })
    await audit(d, u.id, 'entry.free_online', 'ticket', ticket.id, { raffleId: raffle.id, number })
    return safeTicket(ticket)
  })
}

// The real flow confirms the hold when the payment gateway's webhook arrives.
export function buyOnline(actorId, { holdId, sellerCode = '' }) {
  return tx(async (d) => {
    const u = requireRole(d, actorId, ['buyer'])
    const hold = d.holds.find((h) => h.id === holdId && h.userId === u.id)
    if (!hold || hold.expiresAt < Date.now()) fail('hold_expired', 'Your numbers were released. Please choose again.')
    const raffle = raffleIn(d, hold.raffleId)
    requireOnSale(d, raffle)
    let seller = null
    if (sellerCode.trim()) {
      seller = d.users.find((x) => x.role === 'seller' && x.id.toLowerCase() === sellerCode.trim().toLowerCase())
      if (!seller) fail('bad_seller', 'That seller code was not found.')
    }
    const orderId = uuid()
    const tickets = []
    for (const number of hold.numbers) {
      const { ticket } = await issueTicket(d, raffle, { number, channel: 'online', buyerId: u.id, sellerId: seller?.id ?? null, mobile: u.mobile })
      tickets.push(safeTicket(ticket))
    }
    d.orders.push({ id: orderId, buyerId: u.id, raffleId: raffle.id, amountCents: raffle.priceCents * tickets.length, gatewayRef: 'DEMO-' + orderId.slice(0, 8), status: 'paid', at: Date.now() })
    d.holds = d.holds.filter((h) => h.id !== holdId)
    sms(d, u.mobile, `${raffle.title}: ${tickets.length} ticket(s) confirmed.`)
    await audit(d, u.id, 'ticket.buy_online', 'order', orderId, { raffleId: raffle.id, numbers: hold.numbers, sellerId: seller?.id ?? null })
    return tickets
  })
}

export function revealCode(actorId, ticketId) {
  return tx(async (d) => {
    const u = requireRole(d, actorId, ['buyer'])
    const t = ticketIn(d, ticketId)
    if (t.buyerId !== u.id) fail('forbidden', 'This is not your ticket.')
    const keys = d.keyring.find((k) => t.token.split('.')[1] === k.kid)
    await audit(d, u.id, 'ticket.code_viewed', 'ticket', t.id)
    return decryptText(keys, t.codeEnc)
  })
}

// Public check: by QR token, or by raffle + ticket number. Needs no login and
// never reveals the security code.
export async function checkTicket({ token, raffleId, number }) {
  await init()
  const d = readDb()
  let t = null
  if (token) {
    const v = await verifyTicketToken(d.keyring, token)
    if (!v.ok) return { result: 'not_genuine', reason: v.reason }
    t = d.tickets.find((x) => x.id === v.tid)
    if (!t) return { result: 'not_genuine', reason: 'unknown_ticket' }
  } else {
    t = d.tickets.find((x) => x.raffleId === raffleId && x.number === number)
    if (!t) return { result: 'not_found' }
  }
  const raffle = d.raffles.find((r) => r.id === t.raffleId)
  const prize = prizeName(raffle, t.prizeId)
  const claim = d.claims.find((c) => c.ticketId === t.id && c.status === 'paid')
  const base = { ticket: safeTicket(t), raffle: publicRaffle(raffle), prize, claim }
  if (t.status === 'void') return { result: 'void', ...base }
  if (t.status === 'claimed') return { result: 'claimed', ...base }
  if (t.status === 'won') return { result: t.claimPending ? 'claim_pending' : 'winner', ...base }
  if (['results', 'settled'].includes(raffle.status)) return { result: 'no_prize', ...base }
  if (raffle.status === 'cancelled') return { result: 'cancelled', ...base }
  return { result: 'in_draw', ...base }
}

// ---------------------------------------------------------------------------
// seller POS

export function sellPos(actorId, { raffleId, qty, mobile = '', receiptRef = '' }) {
  return tx(async (d) => {
    const seller = requireRole(d, actorId, ['seller'])
    const raffle = raffleIn(d, raffleId)
    requireOnSale(d, raffle)
    if (seller.countryId !== raffle.countryId) fail('wrong_country', 'This raffle is not available in your country.')
    const free = raffle.mode === 'free_entry'
    if (free) {
      if (!receiptRef.trim()) fail('no_receipt', 'Enter the purchase receipt number. Free entries are given with a purchase.')
      if (!(qty >= 1 && qty <= 5)) fail('bad_qty', 'Give between 1 and 5 entries per receipt.')
      if (d.tickets.some((t) => t.raffleId === raffle.id && t.receiptRef === receiptRef.trim() && t.status !== 'void')) {
        fail('receipt_used', 'Entries were already given for this receipt.')
      }
    } else {
      if (!(qty >= 1 && qty <= 50)) fail('bad_qty', 'Choose between 1 and 50 tickets.')
      const cashOwed = d.ledger.filter((l) => l.sellerId === seller.id && l.account === 'seller_cash').reduce((a, l) => a + l.amountCents, 0)
      if (cashOwed + qty * raffle.priceCents > seller.floatLimitCents) {
        fail('float_limit', 'Cash limit reached. Deposit cash with the office before selling more.')
      }
    }
    const numbers = pickFree(d, raffle, qty)
    const out = []
    for (const number of numbers) {
      const { ticket, code } = await issueTicket(d, raffle, { number, channel: 'pos', sellerId: seller.id, mobile: mobile || null, deviceId: seller.deviceId, receiptRef: free ? receiptRef.trim() : null })
      out.push(printView(d, ticket, code))
    }
    if (mobile) sms(d, mobile, `${raffle.title}: ticket(s) ${numbers.map(ticketNo).join(', ')} recorded. Draw ${new Date(raffle.drawAt).toDateString()}.`)
    await audit(d, seller.id, 'ticket.sell_pos', 'raffle', raffle.id, { numbers, device: seller.deviceId })
    return out
  })
}

export function reprint(actorId, { ticketId }) {
  return tx(async (d) => {
    const seller = requireRole(d, actorId, ['seller'])
    const t = ticketIn(d, ticketId)
    if (t.sellerId !== seller.id) fail('forbidden', 'You can only reprint your own sales.')
    if (t.status === 'void') fail('void', 'This ticket is void.')
    if (t.reprintCount >= t.reprintAllowance) {
      const existing = d.requests.find((r) => r.ticketId === t.id && r.type === 'reprint' && r.status === 'pending')
      if (!existing) {
        d.requests.push({ id: uuid(), type: 'reprint', ticketId: t.id, sellerId: seller.id, reason: 'Further reprint', status: 'pending', at: Date.now() })
        await audit(d, seller.id, 'ticket.reprint_requested', 'ticket', t.id)
      }
      return { needsApproval: true }
    }
    t.reprintCount += 1
    const keys = d.keyring.find((k) => t.token.split('.')[1] === k.kid)
    const code = await decryptText(keys, t.codeEnc)
    await audit(d, seller.id, 'ticket.reprint', 'ticket', t.id, { count: t.reprintCount })
    return { needsApproval: false, print: printView(d, t, code, { reprintAt: Date.now() }) }
  })
}

export function voidTicket(actorId, { ticketId, reason, pin, reissue = false }) {
  return tx(async (d) => {
    const seller = requireRole(d, actorId, ['seller'])
    if (pin !== seller.pin) fail('bad_pin', 'Wrong PIN.')
    if (!reason) fail('no_reason', 'Choose a reason.')
    const t = ticketIn(d, ticketId)
    if (t.sellerId !== seller.id) fail('forbidden', 'You can only void your own sales.')
    if (t.status === 'void') fail('void', 'Already void.')
    const raffle = raffleIn(d, t.raffleId)
    if (raffle.status !== 'on_sale') fail('locked', 'Sales are closed, so tickets can no longer be voided.')
    if (Date.now() - t.issuedAt > d.settings.voidWindowMinutes * MIN) {
      const existing = d.requests.find((r) => r.ticketId === t.id && r.type === 'void' && r.status === 'pending')
      if (!existing) {
        d.requests.push({ id: uuid(), type: 'void', ticketId: t.id, sellerId: seller.id, reason, reissue, status: 'pending', at: Date.now() })
        await audit(d, seller.id, 'ticket.void_requested', 'ticket', t.id, { reason })
      }
      return { needsApproval: true }
    }
    return doVoid(d, t, seller.id, reason, reissue)
  })
}

async function doVoid(d, t, actorId, reason, reissue) {
  t.status = 'void'
  t.voidReason = reason
  t.voidedAt = Date.now()
  await reverseTicket(d, t, `Void: ${reason}`)
  await audit(d, actorId, 'ticket.void', 'ticket', t.id, { reason, number: t.number })
  const raffle = raffleIn(d, t.raffleId)
  const slip = { number: t.number, raffleTitle: raffle.title, reason, at: t.voidedAt, serial: t.serial, sellerId: t.sellerId, timezone: raffle.timezone }
  let replacement = null
  if (reissue) {
    const [number] = pickFree(d, raffle, 1)
    const { ticket, code } = await issueTicket(d, raffle, { number, channel: t.channel, sellerId: t.sellerId, buyerId: t.buyerId, mobile: t.mobile, deviceId: t.deviceId })
    replacement = printView(d, ticket, code)
    await audit(d, actorId, 'ticket.reissue', 'ticket', ticket.id, { replaces: t.id })
  }
  return { needsApproval: false, slip, replacement }
}

export function claimPrize(actorId, { token, code, claimantName = '', nic = '' }) {
  return tx(async (d) => {
    const staff = requireRole(d, actorId, ['seller', 'operator', 'super_admin'])
    const v = await verifyTicketToken(d.keyring, token)
    if (!v.ok) {
      await audit(d, staff.id, 'claim.rejected', 'scan', null, { reason: v.reason })
      return { ok: false, error: 'Not a genuine ticket. Do not pay.' }
    }
    const t = ticketIn(d, v.tid)
    const raffle = raffleIn(d, t.raffleId)
    if (t.status === 'void') fail('void', 'This ticket is VOID and not valid.')
    if (t.status === 'claimed') fail('claimed', 'This prize has already been claimed.')
    if (t.status !== 'won') fail('no_prize', 'This ticket did not win a prize.')
    if (!['results', 'settled'].includes(raffle.status)) fail('not_open', 'Claims open after the seed is revealed.')
    if (t.claimPending) fail('claim_pending', 'A claim for this ticket is waiting for approval.')
    if (t.codeTries >= d.settings.maxCodeTries) fail('locked', 'Too many wrong codes. An admin must unlock this ticket.')
    const ok = (await hashCode(String(code).trim().toUpperCase(), t.codeSalt)) === t.codeHash
    if (!ok) {
      t.codeTries += 1
      await audit(d, staff.id, 'claim.wrong_code', 'ticket', t.id, { tries: t.codeTries })
      // Save the failed attempt even though the claim fails.
      const left = d.settings.maxCodeTries - t.codeTries
      return { ok: false, error: left > 0 ? `Wrong security code. ${left} tries left.` : 'Wrong security code. Ticket is now locked.' }
    }
    const country = countryIn(d, raffle.countryId)
    if (staff.role === 'seller' && staff.countryId !== raffle.countryId) fail('wrong_country', 'This ticket is from another country.')
    const prize = prizeName(raffle, t.prizeId)
    const big = prize.valueCents > country.approvalThresholdCents
    if (staff.role === 'seller' && prize.valueCents > country.sellerPayoutLimitCents) {
      if (!big) fail('over_limit', 'This prize is above the seller payout limit. Send the winner to the office.')
    }
    if (big && (!claimantName.trim() || !nic.trim())) fail('need_nic', `This prize needs the winner's name and ${country.idLabel}.`)
    const claim = {
      id: uuid(),
      ticketId: t.id,
      prizeId: prize.id,
      valueCents: prize.valueCents,
      claimantName: claimantName.trim(),
      claimantNic: nic.trim(),
      paidBy: big ? null : staff.id,
      status: big ? 'pending_approval' : 'paid',
      at: Date.now(),
    }
    d.claims.push(claim)
    if (big) {
      t.claimPending = claim.id
      await audit(d, staff.id, 'claim.submitted', 'claim', claim.id, { ticket: t.number, value: prize.valueCents })
      return { ok: true, pendingApproval: true, claim, prize }
    }
    t.status = 'claimed'
    if (staff.role === 'seller') ledger(d, 'seller_cash', -prize.valueCents, { sellerId: staff.id, ticketId: t.id, memo: 'Prize paid from cash' })
    ledger(d, 'prize_payout', prize.valueCents, { ticketId: t.id, memo: prize.name })
    sms(d, t.mobile, `${raffle.title}: ticket ${ticketNo(t.number)} prize claimed.`)
    await audit(d, staff.id, 'claim.paid', 'claim', claim.id, { ticket: t.number, value: prize.valueCents })
    return { ok: true, pendingApproval: false, claim, prize }
  })
}

// ---------------------------------------------------------------------------
// approvals

export function decideRequest(actorId, { requestId, approve }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    const r = d.requests.find((x) => x.id === requestId)
    if (!r || r.status !== 'pending') fail('not_found', 'Request not found.')
    r.status = approve ? 'approved' : 'rejected'
    r.decidedBy = admin.id
    r.decidedAt = Date.now()
    const t = ticketIn(d, r.ticketId)
    await audit(d, admin.id, `request.${r.type}.${r.status}`, 'ticket', t.id)
    if (!approve) return { ok: true }
    if (r.type === 'reprint') t.reprintAllowance += 1
    if (r.type === 'void') {
      const raffle = raffleIn(d, t.raffleId)
      if (raffle.status !== 'on_sale') fail('locked', 'Sales are closed; this void can no longer be approved.')
      if (t.status !== 'void') await doVoid(d, t, admin.id, r.reason, false)
    }
    return { ok: true }
  })
}

export function decideClaim(actorId, { claimId, approve }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const c = d.claims.find((x) => x.id === claimId)
    if (!c || c.status !== 'pending_approval') fail('not_found', 'Claim not found.')
    const t = ticketIn(d, c.ticketId)
    t.claimPending = null
    c.status = approve ? 'paid' : 'rejected'
    c.paidBy = approve ? admin.id : null
    c.decidedAt = Date.now()
    if (approve) {
      t.status = 'claimed'
      ledger(d, 'prize_payout', c.valueCents, { ticketId: t.id, memo: 'Large prize, office payout' })
      sms(d, t.mobile, `Ticket ${ticketNo(t.number)}: prize claim approved.`)
    }
    await audit(d, admin.id, `claim.${c.status}`, 'claim', c.id, { ticket: t.number })
  })
}

export function unlockTicket(actorId, ticketId) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    const t = ticketIn(d, ticketId)
    t.codeTries = 0
    await audit(d, admin.id, 'ticket.unlock', 'ticket', t.id)
  })
}

// ---------------------------------------------------------------------------
// cash and commission

export function recordDeposit(actorId, { sellerId, amountCents, reference }) {
  return tx(async (d) => {
    const op = requireRole(d, actorId, ['operator', 'super_admin'])
    if (!(amountCents > 0)) fail('bad_amount', 'Enter an amount.')
    const dep = { id: uuid(), sellerId, amountCents, reference: reference || '', recordedBy: op.id, status: 'pending', at: Date.now() }
    d.deposits.push(dep)
    await audit(d, op.id, 'deposit.recorded', 'deposit', dep.id, { sellerId, amountCents })
    return dep
  })
}

export function decideDeposit(actorId, { depositId, approve }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const dep = d.deposits.find((x) => x.id === depositId)
    if (!dep || dep.status !== 'pending') fail('not_found', 'Deposit not found.')
    dep.status = approve ? 'confirmed' : 'rejected'
    dep.decidedBy = admin.id
    if (approve) ledger(d, 'seller_cash', -dep.amountCents, { sellerId: dep.sellerId, memo: `Deposit ${dep.reference}` })
    await audit(d, admin.id, `deposit.${dep.status}`, 'deposit', dep.id)
  })
}

// mode 'net': commission is subtracted from the cash the seller owes.
// mode 'bank': commission is paid out by bank transfer.
export function payCommission(actorId, { sellerId, mode }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const owed = d.ledger.filter((l) => l.sellerId === sellerId && l.account === 'seller_commission').reduce((a, l) => a + l.amountCents, 0)
    if (owed <= 0) fail('nothing_owed', 'No commission is owed.')
    ledger(d, 'seller_commission', -owed, { sellerId, memo: `Commission paid (${mode})` })
    if (mode === 'net') ledger(d, 'seller_cash', -owed, { sellerId, memo: 'Commission netted against cash' })
    await audit(d, admin.id, 'commission.paid', 'seller', sellerId, { amountCents: owed, mode })
    return owed
  })
}

export function updateSeller(actorId, sellerId, patch) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    const s = userIn(d, sellerId)
    if (!s || s.role !== 'seller') fail('not_found', 'Seller not found.')
    const allowed = admin.role === 'super_admin' ? ['status', 'commissionOverride', 'floatLimitCents', 'area', 'deviceId', 'countryId'] : ['status', 'area', 'deviceId']
    const before = {}
    for (const k of Object.keys(patch)) {
      if (!allowed.includes(k)) fail('forbidden', `Only a Super Admin can change ${k}.`)
      before[k] = s[k]
      s[k] = patch[k]
    }
    await audit(d, admin.id, 'seller.update', 'seller', s.id, { before, after: patch })
  })
}

export function inviteSeller(actorId, { name, mobile, area, deviceId, countryId }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    if (!name.trim()) fail('bad_name', 'Enter a name.')
    const country = countryIn(d, countryId)
    const nextNo = 1000 + d.users.filter((u) => u.role === 'seller').length * 7 + 3
    const s = { id: `S-${nextNo}`, role: 'seller', countryId: country.id, name, mobile, area, deviceId, pin: '1234', floatLimitCents: country.defaultFloatLimitCents, commissionOverride: null, status: 'active' }
    d.users.push(s)
    await audit(d, admin.id, 'seller.invite', 'seller', s.id)
    return s
  })
}

// ---------------------------------------------------------------------------
// countries (managed by the Super Admin)

const COUNTRY_FIELDS = ['code', 'name', 'currency', 'timezone', 'languages', 'mode', 'idLabel', 'approvalThresholdCents', 'sellerPayoutLimitCents', 'defaultFloatLimitCents', 'paymentGateway', 'smsProvider', 'enabled']

function cleanCountry(d, input, existing) {
  const c = { ...(existing ?? {}) }
  for (const k of COUNTRY_FIELDS) if (k in input) c[k] = input[k]
  c.code = String(c.code ?? '').trim().toUpperCase()
  c.name = String(c.name ?? '').trim()
  c.currency = String(c.currency ?? '').trim().toUpperCase()
  c.idLabel = String(c.idLabel ?? '').trim()
  c.languages = Array.isArray(c.languages) ? c.languages : String(c.languages ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (!/^[A-Z]{2}$/.test(c.code)) fail('bad_code', 'Country code must be 2 letters (ISO), e.g. MV.')
  if (d.countries.some((x) => x.code === c.code && x.id !== existing?.id)) fail('dup_code', `${c.code} is already added.`)
  if (!c.name) fail('bad_name', 'Enter the country name.')
  if (!/^[A-Z]{3}$/.test(c.currency)) fail('bad_currency', 'Currency must be a 3-letter ISO code, e.g. MVR.')
  try {
    new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format()
  } catch {
    fail('bad_tz', 'Enter a valid time zone, e.g. Indian/Maldives.')
  }
  if (!['paid', 'free_entry'].includes(c.mode)) fail('bad_mode', 'Choose paid tickets or free entry.')
  if (!c.idLabel) fail('bad_id', 'Enter the ID document winners show, e.g. National ID card.')
  for (const k of ['approvalThresholdCents', 'sellerPayoutLimitCents', 'defaultFloatLimitCents']) {
    c[k] = Number(c[k])
    if (!(c[k] >= 0)) fail('bad_amount', 'Amounts must be zero or more.')
  }
  c.enabled = !!c.enabled
  return c
}

export function createCountry(actorId, input) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const c = cleanCountry(d, { enabled: false, ...input })
    c.id = c.code
    c.legalStatus = 'pending'
    c.legalRef = ''
    c.createdAt = Date.now()
    d.countries.push(c)
    await audit(d, admin.id, 'country.create', 'country', c.id, { name: c.name, mode: c.mode, currency: c.currency })
    return c
  })
}

export function updateCountry(actorId, countryId, patch) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const existing = countryIn(d, countryId)
    if ('code' in patch && patch.code.toUpperCase() !== existing.code) fail('code_fixed', 'The country code cannot change once added.')
    const live = d.raffles.some((r) => r.countryId === countryId && ['on_sale', 'sales_closed', 'live'].includes(r.status))
    if ('mode' in patch && patch.mode !== existing.mode && live) fail('live_raffles', 'Finish or cancel the running raffles before changing the mode.')
    if ('currency' in patch && patch.currency.toUpperCase() !== existing.currency && d.raffles.some((r) => r.countryId === countryId)) {
      fail('currency_fixed', 'The currency cannot change after raffles exist in this country.')
    }
    const next = cleanCountry(d, patch, existing)
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, existing[k]]))
    Object.assign(existing, next)
    await audit(d, admin.id, 'country.update', 'country', countryId, { before, after: patch })
  })
}

// Recording legal approval is what allows raffles to be published there.
export function setCountryLegal(actorId, countryId, { approved, reference }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const c = countryIn(d, countryId)
    if (approved && !String(reference ?? '').trim()) fail('no_ref', 'Enter the legal opinion or licence reference.')
    c.legalStatus = approved ? 'approved' : 'pending'
    c.legalRef = approved ? reference.trim() : ''
    c.legalBy = approved ? admin.id : null
    c.legalAt = approved ? Date.now() : null
    await audit(d, admin.id, approved ? 'country.legal_approved' : 'country.legal_withdrawn', 'country', c.id, { reference: c.legalRef })
  })
}

// ---------------------------------------------------------------------------
// raffles and the draw

export function createRaffle(actorId, data) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    return createRaffleIn(d, admin.id, data)
  })
}

async function createRaffleIn(d, actorId, { countryId, title, priceCents = 0, totalTickets, commissionPct = 0, commissionPerEntryCents = 0, drawAt, salesCloseAt, youtubeUrl = '', prizes }) {
  const country = countryIn(d, countryId)
  const mode = country.mode
  if (!title?.trim()) fail('bad_title', 'Enter a title.')
  if (mode === 'paid' && !(priceCents > 0)) fail('bad_price', 'Enter a ticket price.')
  if (mode === 'free_entry') {
    priceCents = 0
    commissionPct = 0
    if (!(commissionPerEntryCents >= 0)) fail('bad_fee', 'Enter the per-entry fee (0 if none).')
  }
  if (!(totalTickets > 0 && totalTickets <= 99999)) fail('bad_total', 'Total tickets must be 1 to 99,999.')
  if (!(commissionPct >= 0 && commissionPct <= 50)) fail('bad_rate', 'Commission must be 0 to 50%.')
  if (!(drawAt > salesCloseAt)) fail('bad_dates', 'The draw must be after sales close.')
  const cleanPrizes = (prizes ?? []).filter((p) => p.name?.trim() && p.quantity > 0)
  if (!cleanPrizes.length) fail('no_prizes', 'Add at least one prize.')
  const winners = cleanPrizes.reduce((a, p) => a + Number(p.quantity), 0)
  if (winners > totalTickets) fail('too_many_prizes', 'More prizes than tickets.')
  const r = {
    id: uuid(),
    code: country.code + (d.raffles.length + 1).toString().padStart(2, '0'),
    countryId: country.id,
    currency: country.currency,
    timezone: country.timezone,
    mode,
    commissionPerEntryCents: mode === 'free_entry' ? commissionPerEntryCents : 0,
    title: title.trim(),
    priceCents,
    totalTickets,
    commissionPct,
    salesOpenAt: Date.now(),
    salesCloseAt,
    drawAt,
    youtubeUrl,
    status: 'draft',
    seed: null,
    seedHash: null,
    seedRevealed: false,
    lockedNumbers: [],
    lockedHash: null,
    prizes: cleanPrizes.map((p, i) => ({ id: `p${i + 1}`, tier: i + 1, name: p.name.trim(), valueCents: Number(p.valueCents) || 0, quantity: Number(p.quantity) })),
    results: [],
    claimDeadline: null,
    nextSerial: 0,
    createdAt: Date.now(),
  }
  d.raffles.push(r)
  await audit(d, actorId, 'raffle.create', 'raffle', r.id, { title: r.title })
  return publicRaffle(r)
}

export function updateRaffle(actorId, raffleId, patch) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    const r = raffleIn(d, raffleId)
    const always = ['youtubeUrl']
    for (const k of Object.keys(patch)) {
      if (!always.includes(k) && r.status !== 'draft') fail('locked', 'Only the stream link can change after publishing.')
      r[k] = patch[k]
    }
    await audit(d, admin.id, 'raffle.update', 'raffle', r.id, patch)
  })
}

export function publishRaffle(actorId, raffleId) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    const r = raffleIn(d, raffleId)
    if (r.status !== 'draft') fail('bad_state', 'Only a draft can be published.')
    const c = countryIn(d, r.countryId)
    if (!c.enabled) fail('country_off', `${c.name} is switched off. Turn it on in Countries first.`)
    if (c.legalStatus !== 'approved') fail('no_legal', `Record legal approval for ${c.name} in Countries before selling there.`)
    if (c.mode !== r.mode) fail('mode_changed', `${c.name} is now set to ${c.mode === 'free_entry' ? 'free entry' : 'paid tickets'}. Create the raffle again.`)
    r.status = 'on_sale'
    await audit(d, admin.id, 'raffle.publish', 'raffle', r.id)
  })
}

export function cancelRaffle(actorId, raffleId) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['super_admin'])
    const r = raffleIn(d, raffleId)
    if (!['draft', 'on_sale'].includes(r.status)) fail('bad_state', 'A raffle can only be cancelled before sales close.')
    r.status = 'cancelled'
    for (const t of d.tickets.filter((x) => x.raffleId === r.id && x.status !== 'void')) {
      t.status = 'void'
      t.voidReason = 'Raffle cancelled, refund due'
      await reverseTicket(d, t, 'Raffle cancelled')
      sms(d, t.mobile, `${r.title} was cancelled. Ticket ${ticketNo(t.number)} will be refunded.`)
    }
    await audit(d, admin.id, 'raffle.cancel', 'raffle', r.id)
  })
}

export function closeSales(actorId, raffleId) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    return closeSalesIn(d, admin.id, raffleId)
  })
}

async function closeSalesIn(d, actorId, raffleId) {
  const r = raffleIn(d, raffleId)
  if (r.status !== 'on_sale') fail('bad_state', 'Sales are not open.')
  const numbers = d.tickets
    .filter((t) => t.raffleId === r.id && t.status !== 'void')
    .map((t) => t.number)
    .sort((a, b) => a - b)
  const winnersNeeded = r.prizes.reduce((a, p) => a + p.quantity, 0)
  if (numbers.length < winnersNeeded) fail('too_few', `At least ${winnersNeeded} tickets must be sold to draw every prize.`)
  r.seed = toHex(randomBytes(32))
  r.seedHash = await sha256Hex(r.seed)
  r.lockedNumbers = numbers
  r.lockedHash = await sha256Hex(numbers.join(','))
  r.status = 'sales_closed'
  r.salesCloseAt = Math.min(r.salesCloseAt, Date.now())
  d.holds = d.holds.filter((h) => h.raffleId !== r.id)
  await audit(d, actorId, 'raffle.close_sales', 'raffle', r.id, { sold: numbers.length, seedHash: r.seedHash, lockedHash: r.lockedHash })
}

export function drawPrize(actorId, { raffleId, prizeId }) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    return drawPrizeIn(d, admin.id, raffleId, prizeId)
  })
}

async function drawPrizeIn(d, actorId, raffleId, prizeId) {
  const r = raffleIn(d, raffleId)
  if (!['sales_closed', 'live'].includes(r.status)) fail('bad_state', 'Close sales before drawing.')
  const prize = r.prizes.find((p) => p.id === prizeId)
  if (!prize) fail('not_found', 'Prize not found.')
  if (r.results.some((x) => x.prizeId === prizeId)) fail('drawn', 'This prize has already been drawn.')
  const taken = r.results.flatMap((x) => x.numbers)
  const numbers = await pickWinners(r.seed, prize.id, r.lockedNumbers, prize.quantity, taken)
  const ticketIds = numbers.map((n) => {
    const t = d.tickets.find((x) => x.raffleId === r.id && x.number === n && x.status !== 'void')
    t.status = 'won'
    t.prizeId = prize.id
    sms(d, t.mobile, `Congratulations! Ticket ${ticketNo(n)} won ${prize.name} in ${r.title}.`)
    return t.id
  })
  r.results.push({ prizeId, numbers, ticketIds, drawnAt: Date.now(), drawnBy: actorId })
  r.status = 'live'
  await audit(d, actorId, 'draw.prize', 'raffle', r.id, { prizeId, numbers })
  return numbers
}

export function revealSeed(actorId, raffleId) {
  return tx(async (d) => {
    const admin = requireRole(d, actorId, ['operator', 'super_admin'])
    return revealSeedIn(d, admin.id, raffleId)
  })
}

async function revealSeedIn(d, actorId, raffleId) {
  const r = raffleIn(d, raffleId)
  if (r.status !== 'live') fail('bad_state', 'Draw every prize first.')
  if (r.results.length !== r.prizes.length) fail('not_done', 'Draw every prize first.')
  r.seedRevealed = true
  r.status = 'results'
  r.claimDeadline = Date.now() + d.settings.claimDays * DAY
  await audit(d, actorId, 'draw.reveal_seed', 'raffle', r.id, { seed: r.seed })
}

// Anyone can run this after the seed is revealed.
export async function verifyDraw(raffle) {
  if (!raffle?.seed) return { ok: false, reason: 'Seed not revealed yet.' }
  const steps = []
  const hashOk = (await sha256Hex(raffle.seed)) === raffle.seedHash
  steps.push({ label: 'Seed matches the hash published before the draw', ok: hashOk })
  const listOk = (await sha256Hex(raffle.lockedNumbers.join(','))) === raffle.lockedHash
  steps.push({ label: 'Ticket list matches the list locked at sales close', ok: listOk })
  const taken = []
  let allMatch = true
  for (const res of raffle.results) {
    const prize = raffle.prizes.find((p) => p.id === res.prizeId)
    const again = await pickWinners(raffle.seed, prize.id, raffle.lockedNumbers, prize.quantity, taken)
    const match = JSON.stringify(again) === JSON.stringify(res.numbers)
    allMatch &&= match
    taken.push(...again)
    steps.push({ label: `${prize.name}: re-run gives the same numbers`, ok: match })
  }
  return { ok: hashOk && listOk && allMatch, steps }
}

export async function verifyAuditChain() {
  const log = readDb().audit
  let prev = 'GENESIS'
  for (const e of log) {
    const { prevHash, hash, ...entry } = e
    if (prevHash !== prev) return { ok: false, brokenAt: e.id }
    if ((await sha256Hex(prev + JSON.stringify(entry))) !== hash) return { ok: false, brokenAt: e.id }
    prev = hash
  }
  return { ok: true, count: log.length }
}

// ---------------------------------------------------------------------------
// demo seed data

async function buildSeedDb() {
  const keys = await generateKeys()
  const now = Date.now()
  const d = {
    schema: 1,
    keyring: [keys],
    settings: {
      voidWindowMinutes: 5,
      freeEntriesPerDay: 1,
      maxCodeTries: 3,
      holdMinutes: 10,
      claimDays: 90,
    },
    countries: [
      {
        id: 'LK', code: 'LK', name: 'Sri Lanka', currency: 'LKR', timezone: 'Asia/Colombo', languages: ['Sinhala', 'Tamil', 'English'],
        mode: 'paid', idLabel: 'NIC',
        approvalThresholdCents: 10_000_000, // LKR 100,000: Super Admin approval + NIC above this
        sellerPayoutLimitCents: 2_500_000, // LKR 25,000: sellers may pay prizes up to this
        defaultFloatLimitCents: 5_000_000,
        paymentGateway: '[Choose gateway]', smsProvider: '[Choose SMS provider]',
        enabled: true, legalStatus: 'approved', legalRef: 'DEMO ONLY: replace with your legal opinion reference', legalBy: 'A-01', legalAt: now, createdAt: now,
      },
      {
        id: 'MV', code: 'MV', name: 'Maldives', currency: 'MVR', timezone: 'Indian/Maldives', languages: ['Dhivehi', 'English'],
        mode: 'free_entry', idLabel: 'National ID card',
        approvalThresholdCents: 1_000_000, // MVR 10,000
        sellerPayoutLimitCents: 200_000, // MVR 2,000
        defaultFloatLimitCents: 0,
        paymentGateway: 'Not needed (free entry)', smsProvider: '[Choose SMS provider]',
        enabled: false, legalStatus: 'pending', legalRef: '', createdAt: now,
      },
    ],
    users: [
      { id: 'B-1001', role: 'buyer', countryId: 'LK', name: 'Nimal Perera', mobile: '0771234567', status: 'active' },
      { id: 'B-1002', role: 'buyer', countryId: 'LK', name: 'Ayesha Fernando', mobile: '0712345678', status: 'active' },
      { id: 'S-1042', role: 'seller', countryId: 'LK', name: 'Kasun Silva', mobile: '0761112233', area: 'Tangalle', deviceId: 'T-08', pin: '1234', floatLimitCents: 5_000_000, commissionOverride: null, status: 'active' },
      { id: 'S-0877', role: 'seller', countryId: 'LK', name: 'Dilani Jayasuriya', mobile: '0752223344', area: 'Matara', deviceId: 'T-03', pin: '1234', floatLimitCents: 5_000_000, commissionOverride: 12, status: 'active' },
      { id: 'S-1120', role: 'seller', countryId: 'LK', name: 'Ruwan Kumara', mobile: '0703334455', area: 'Hambantota', deviceId: 'T-11', pin: '1234', floatLimitCents: 3_000_000, commissionOverride: null, status: 'active' },
      { id: 'B-2001', role: 'buyer', countryId: 'MV', name: 'Aishath Ibrahim', mobile: '7771234', status: 'active' },
      { id: 'S-2001', role: 'seller', countryId: 'MV', name: 'Ahmed Shifaz', mobile: '7654321', area: 'Malé', deviceId: 'M-01', pin: '1234', floatLimitCents: 0, commissionOverride: null, status: 'active' },
      { id: 'O-01', role: 'operator', name: 'Chamari (Operator)', status: 'active' },
      { id: 'A-01', role: 'super_admin', name: 'Super Admin', status: 'active' },
    ],
    raffles: [],
    tickets: [],
    holds: [],
    orders: [],
    ledger: [],
    claims: [],
    requests: [],
    deposits: [],
    sms: [],
    audit: [],
  }

  // A finished raffle, so claims can be tried straight away. Retried until the
  // demo buyer holds at least one winning ticket.
  const before = structuredClone(d)
  for (let attempt = 0; attempt < 20; attempt++) {
    Object.assign(d, structuredClone(before))
    const past = await createRaffleIn(d, 'A-01', {
      countryId: 'LK',
      title: 'Weekend Draw #50',
      priceCents: 10_000,
      totalTickets: 5000,
      commissionPct: 10,
      salesCloseAt: now + DAY,
      drawAt: now + DAY + 2 * 60 * MIN,
      prizes: [
        { name: 'Cash LKR 20,000', valueCents: 2_000_000, quantity: 1 },
        { name: 'Cash LKR 5,000', valueCents: 500_000, quantity: 4 },
      ],
    })
    const pr = d.raffles.find((x) => x.id === past.id)
    pr.status = 'on_sale'
    for (const n of pickFree(d, pr, 8)) await issueTicket(d, pr, { number: n, channel: 'online', buyerId: 'B-1001', mobile: '0771234567' })
    for (const n of pickFree(d, pr, 12)) await issueTicket(d, pr, { number: n, channel: 'pos', sellerId: 'S-0877', deviceId: 'T-03' })
    await closeSalesIn(d, 'O-01', pr.id)
    for (const p of pr.prizes) await drawPrizeIn(d, 'O-01', pr.id, p.id)
    await revealSeedIn(d, 'O-01', pr.id)
    pr.drawAt = now - 6 * DAY
    pr.salesCloseAt = now - 6 * DAY - 2 * 60 * MIN
    if (d.tickets.some((t) => t.raffleId === pr.id && t.buyerId === 'B-1001' && t.status === 'won')) break
  }

  // The main raffle on sale now.
  const mega = await createRaffleIn(d, 'A-01', {
      countryId: 'LK',
    title: 'Mega Draw #24',
    priceCents: 20_000,
    totalTickets: 10000,
    commissionPct: 10,
    salesCloseAt: now + 3 * DAY - 2 * 60 * MIN,
    drawAt: now + 3 * DAY,
    youtubeUrl: '',
    prizes: [
      { name: 'Car', valueCents: 650_000_000, quantity: 1 },
      { name: 'Motorbike', valueCents: 65_000_000, quantity: 2 },
      { name: 'Cash LKR 25,000', valueCents: 2_500_000, quantity: 22 },
    ],
  })
  const m = d.raffles.find((x) => x.id === mega.id)
  m.status = 'on_sale'
  const sell = async (raffle, sellerId, count, minutesAgo) => {
    const s = userIn(d, sellerId)
    const made = []
    for (const n of pickFree(d, raffle, count)) {
      const { ticket } = await issueTicket(d, raffle, { number: n, channel: 'pos', sellerId, deviceId: s.deviceId })
      ticket.issuedAt = now - minutesAgo * MIN
      made.push(ticket)
    }
    return made
  }
  await sell(m, 'S-0877', 90, 600)
  await sell(m, 'S-1042', 60, 300)
  const ruwan = await sell(m, 'S-1120', 40, 120)
  for (const n of pickFree(d, m, 3)) await issueTicket(d, m, { number: n, channel: 'online', buyerId: 'B-1001', mobile: '0771234567' })
  for (const n of pickFree(d, m, 2)) await issueTicket(d, m, { number: n, channel: 'online', buyerId: 'B-1002', mobile: '0712345678', sellerId: 'S-1042' })
  d.requests.push({ id: uuid(), type: 'void', ticketId: ruwan[3].id, sellerId: 'S-1120', reason: 'Duplicate print', reissue: false, status: 'pending', at: now - 30 * MIN })
  ruwan[5].reprintCount = 1
  d.requests.push({ id: uuid(), type: 'reprint', ticketId: ruwan[5].id, sellerId: 'S-1120', reason: 'Further reprint', status: 'pending', at: now - 20 * MIN })
  d.deposits.push({ id: uuid(), sellerId: 'S-0877', amountCents: 1_000_000, reference: 'BOC slip 55821', recordedBy: 'O-01', status: 'pending', at: now - 45 * MIN })

  const weekend = await createRaffleIn(d, 'A-01', {
      countryId: 'LK',
    title: 'Weekend Draw #51',
    priceCents: 10_000,
    totalTickets: 5000,
    commissionPct: 10,
    salesCloseAt: now + 6 * DAY - 2 * 60 * MIN,
    drawAt: now + 6 * DAY,
    prizes: [
      { name: 'Motorbike', valueCents: 65_000_000, quantity: 1 },
      { name: 'Cash LKR 10,000', valueCents: 1_000_000, quantity: 9 },
    ],
  })
  const w = d.raffles.find((x) => x.id === weekend.id)
  w.status = 'on_sale'
  await sell(w, 'S-1042', 25, 200)
  await sell(w, 'S-0877', 30, 400)

  // Maldives: a free-entry promotion, still a draft until legal approval.
  await createRaffleIn(d, 'A-01', {
    countryId: 'MV',
    title: 'Malé Shopping Festival Draw',
    totalTickets: 20000,
    commissionPerEntryCents: 500, // MVR 5 per entry given with a purchase
    salesCloseAt: now + 20 * DAY,
    drawAt: now + 20 * DAY + 3 * 60 * MIN,
    prizes: [
      { name: 'Motorbike', valueCents: 4_500_000, quantity: 1 },
      { name: 'Shopping voucher MVR 1,000', valueCents: 100_000, quantity: 20 },
    ],
  })

  await audit(d, 'system', 'demo.seeded', 'system', null)
  return d
}
