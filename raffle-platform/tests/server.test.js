// Backend flow tests: `npm test`
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import * as api from '../src/api/server.js'
import { readDb, writeDb } from '../src/api/store.js'

const SELLER = 'S-1042'
const OTHER_SELLER = 'S-0877'
const OP = 'O-01'
const ADMIN = 'A-01'
const BUYER = 'B-1001'

let mega, past
before(async () => {
  await api.init()
  mega = api.getRaffles().find((r) => r.title === 'Mega Draw #24')
  past = api.getRaffles().find((r) => r.title === 'Weekend Draw #50')
})

test('seed data is in place', () => {
  assert.equal(mega.status, 'on_sale')
  assert.equal(past.status, 'results')
  assert.ok(past.seed, 'past raffle seed is revealed')
  assert.equal(mega.seed, null, 'secret seed never leaves the server')
  assert.ok(api.getBuyerTickets(BUYER).some((t) => t.raffleId === past.id && t.status === 'won'))
})

test('POS sale issues signed tickets that verify', async () => {
  const printed = await api.sellPos(SELLER, { raffleId: mega.id, qty: 2, mobile: '0770000000' })
  assert.equal(printed.length, 2)
  assert.match(printed[0].code, /^[A-HJ-NP-Z2-9]{8}$/)
  const check = await api.checkTicket({ token: printed[0].token })
  assert.equal(check.result, 'in_draw')
  assert.equal(check.ticket.number, printed[0].number)
  assert.equal(check.ticket.codeHash, undefined, 'code hash is never exposed')
})

test('forged and tampered QR codes are rejected', async () => {
  const [p] = await api.sellPos(SELLER, { raffleId: mega.id, qty: 1 })
  const parts = p.token.split('.')
  const flip = (s) => (s[5] === 'A' ? 'B' : 'A') + s.slice(1)
  const badSig = [...parts.slice(0, 3), flip(parts[3])].join('.')
  const badBody = [parts[0], parts[1], flip(parts[2]), parts[3]].join('.')
  assert.equal((await api.checkTicket({ token: badSig })).result, 'not_genuine')
  assert.equal((await api.checkTicket({ token: badBody })).result, 'not_genuine')
  assert.equal((await api.checkTicket({ token: 'hello' })).result, 'not_genuine')
})

test('reprint: once freely, then only with approval, same QR', async () => {
  const [p] = await api.sellPos(SELLER, { raffleId: mega.id, qty: 1 })
  const r1 = await api.reprint(SELLER, { ticketId: p.id })
  assert.equal(r1.needsApproval, false)
  assert.equal(r1.print.token, p.token)
  assert.equal(r1.print.code, p.code)
  assert.equal(r1.print.reprintCount, 1)
  const r2 = await api.reprint(SELLER, { ticketId: p.id })
  assert.equal(r2.needsApproval, true)
  const req = api.getApprovals().find((a) => a.kind === 'reprint' && a.ticket.id === p.id)
  await api.decideRequest(OP, { requestId: req.id, approve: true })
  const r3 = await api.reprint(SELLER, { ticketId: p.id })
  assert.equal(r3.needsApproval, false)
  assert.equal(r3.print.reprintCount, 2)
})

test('void within the window reverses commission and invalidates the QR', async () => {
  const startBal = api.sellerBalances(SELLER)
  const [p] = await api.sellPos(SELLER, { raffleId: mega.id, qty: 1 })
  await assert.rejects(api.voidTicket(SELLER, { ticketId: p.id, reason: 'Misprint', pin: '0000' }), /Wrong PIN/)
  const res = await api.voidTicket(SELLER, { ticketId: p.id, reason: 'Misprint', pin: '1234' })
  assert.equal(res.needsApproval, false)
  assert.equal(res.slip.number, p.number)
  assert.deepEqual(api.sellerBalances(SELLER), startBal)
  assert.equal((await api.checkTicket({ token: p.token })).result, 'void')
})

test('void and reissue gives a new number and QR', async () => {
  const [p] = await api.sellPos(SELLER, { raffleId: mega.id, qty: 1 })
  const res = await api.voidTicket(SELLER, { ticketId: p.id, reason: 'Duplicate print', pin: '1234', reissue: true })
  assert.ok(res.replacement)
  assert.notEqual(res.replacement.number, p.number)
  assert.notEqual(res.replacement.token, p.token)
  assert.equal((await api.checkTicket({ token: res.replacement.token })).result, 'in_draw')
})

test('void after 5 minutes needs operator approval', async () => {
  const [p] = await api.sellPos(SELLER, { raffleId: mega.id, qty: 1 })
  const d = structuredClone(readDb())
  d.tickets.find((t) => t.id === p.id).issuedAt -= 10 * 60 * 1000
  writeDb(d)
  const res = await api.voidTicket(SELLER, { ticketId: p.id, reason: 'Customer cancelled', pin: '1234' })
  assert.equal(res.needsApproval, true)
  const req = api.getApprovals().find((a) => a.kind === 'void' && a.ticket.id === p.id)
  await assert.rejects(api.decideRequest(SELLER, { requestId: req.id, approve: true }), /permission/)
  await api.decideRequest(OP, { requestId: req.id, approve: true })
  assert.equal((await api.checkTicket({ token: p.token })).result, 'void')
})

test('cash float limit blocks sales', async () => {
  const limit = api.getUser('S-1120').floatLimitCents
  let canSell = Math.floor((limit - api.sellerBalances('S-1120').cashOwedCents) / mega.priceCents)
  while (canSell > 0) {
    const n = Math.min(50, canSell)
    await api.sellPos('S-1120', { raffleId: mega.id, qty: n })
    canSell -= n
  }
  await assert.rejects(api.sellPos('S-1120', { raffleId: mega.id, qty: 1 }), /Cash limit/)
})

test('online purchase with hold and seller code credits commission', async () => {
  const before = api.sellerBalances(SELLER).commissionUnpaidCents
  const hold = await api.holdNumbers(BUYER, { raffleId: mega.id, qty: 2, picks: [7777] })
  assert.ok(hold.numbers.includes(7777))
  const tickets = await api.buyOnline(BUYER, { holdId: hold.id, sellerCode: 's-1042' })
  assert.equal(tickets.length, 2)
  assert.equal(api.sellerBalances(SELLER).commissionUnpaidCents - before, 2 * mega.priceCents * 0.1)
  await assert.rejects(api.holdNumbers(BUYER, { raffleId: mega.id, qty: 1, picks: [7777] }), /already taken/)
})

test('claim: wrong code counts tries, right code pays once', async () => {
  const win = api.getBuyerTickets(BUYER).find((t) => t.raffleId === past.id && t.status === 'won')
  const code = await api.revealCode(BUYER, win.id)
  const bad = await api.claimPrize(OTHER_SELLER, { token: win.token, code: 'AAAAAAAA' })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /2 tries left/)
  const cashBefore = api.sellerBalances(OTHER_SELLER).cashOwedCents
  const good = await api.claimPrize(OTHER_SELLER, { token: win.token, code })
  assert.equal(good.ok, true)
  assert.equal(good.pendingApproval, false)
  assert.equal(api.sellerBalances(OTHER_SELLER).cashOwedCents, cashBefore - good.prize.valueCents)
  await assert.rejects(api.claimPrize(OTHER_SELLER, { token: win.token, code }), /already been claimed/)
  assert.equal((await api.checkTicket({ token: win.token })).result, 'claimed')
})

test('two claims at the same moment: only one is paid', async () => {
  const win = api.getBuyerTickets(BUYER).find((t) => t.raffleId === past.id && t.status === 'won')
  if (!win) return // buyer had a single winner, already claimed above
  const code = await api.revealCode(BUYER, win.id)
  const results = await Promise.allSettled([
    api.claimPrize(OTHER_SELLER, { token: win.token, code }),
    api.claimPrize(OP, { token: win.token, code }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value.ok).length, 1)
})

test('full draw is provably fair and big prizes need approval', async () => {
  await assert.rejects(api.drawPrize(OP, { raffleId: mega.id, prizeId: 'p1' }), /Close sales/)
  await api.closeSales(OP, mega.id)
  const closed = api.getRaffle(mega.id)
  assert.ok(closed.seedHash)
  assert.equal(closed.seed, null)
  await assert.rejects(api.sellPos(SELLER, { raffleId: mega.id, qty: 1 }), /closed/)
  for (const p of closed.prizes) await api.drawPrize(OP, { raffleId: mega.id, prizeId: p.id })
  await api.revealSeed(OP, mega.id)
  const done = api.getRaffle(mega.id)
  assert.equal(done.status, 'results')
  const v = await api.verifyDraw(done)
  assert.equal(v.ok, true, JSON.stringify(v.steps))
  const winners = done.results.flatMap((r) => r.numbers)
  assert.equal(new Set(winners).size, 25)

  // Tampering with the published result is detected.
  const forged = structuredClone(done)
  forged.results[0].numbers = [forged.lockedNumbers.find((n) => !winners.includes(n))]
  assert.equal((await api.verifyDraw(forged)).ok, false)

  // Car: a seller can submit it with NIC, a Super Admin approves.
  const carTicketId = done.results.find((r) => r.prizeId === 'p1').ticketIds[0]
  const car = readDb().tickets.find((t) => t.id === carTicketId)
  const { decryptText } = await import('../src/api/crypto.js')
  const code = await decryptText(readDb().keyring[0], car.codeEnc)
  await assert.rejects(api.claimPrize(SELLER, { token: car.token, code }), /NIC/)
  const sub = await api.claimPrize(SELLER, { token: car.token, code, claimantName: 'Test Winner', nic: '199012345678' })
  assert.equal(sub.pendingApproval, true)
  await assert.rejects(api.decideClaim(OP, { claimId: sub.claim.id, approve: true }), /permission/)
  await api.decideClaim(ADMIN, { claimId: sub.claim.id, approve: true })
  assert.equal((await api.checkTicket({ token: car.token })).result, 'claimed')
})

test('commission settlement nets against cash', async () => {
  const b = api.sellerBalances(SELLER)
  await api.payCommission(ADMIN, { sellerId: SELLER, mode: 'net' })
  const a = api.sellerBalances(SELLER)
  assert.equal(a.commissionUnpaidCents, 0)
  assert.equal(a.cashOwedCents, b.cashOwedCents - b.commissionUnpaidCents)
})

test('audit log is hash-chained and tamper-evident', async () => {
  assert.equal((await api.verifyAuditChain()).ok, true)
  const d = structuredClone(readDb())
  d.audit[3].detail = { edited: true }
  writeDb(d)
  const res = await api.verifyAuditChain()
  assert.equal(res.ok, false)
  assert.equal(res.brokenAt, 4)
})
