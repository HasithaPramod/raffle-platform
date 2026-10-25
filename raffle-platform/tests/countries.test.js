// Country management, paid MVR draws and free-entry mode: `npm test`
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import * as api from '../src/api/server.js'

const ADMIN = 'A-01'
const OP = 'O-01'
let mvRaffle
let aeRaffle
let aeSeller

before(async () => {
  await api.resetDemo()
  mvRaffle = api.getRaffles().find((r) => r.title === 'Maldives Mega Draw #24')
})

const base = {
  code: 'AE', name: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai', languages: 'Arabic, English',
  mode: 'free_entry', idLabel: 'Emirates ID', approvalThresholdCents: 1_000_000, sellerPayoutLimitCents: 100_000,
  defaultFloatLimitCents: 0, paymentGateway: '', smsProvider: '',
}

test('the Maldives is the first country: on, paid tickets in MVR', () => {
  const [first] = api.getCountries()
  assert.equal(first.id, 'MV')
  assert.equal(first.currency, 'MVR')
  assert.equal(first.mode, 'paid')
  assert.equal(first.enabled, true)
  assert.equal(mvRaffle.status, 'on_sale')
  assert.equal(mvRaffle.currency, 'MVR')
  assert.equal(mvRaffle.priceCents, 10_000)
})

test('Maldives POS sale collects MVR cash and pays 10% commission', async () => {
  await assert.rejects(api.sellPos('S-1042', { raffleId: mvRaffle.id, qty: 1 }), /not available in your country/)
  const before = api.sellerBalances('S-2001')
  const out = await api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 2 })
  assert.equal(out[0].currency, 'MVR')
  assert.equal(out[0].timezone, 'Indian/Maldives')
  const after = api.sellerBalances('S-2001')
  assert.equal(after.currency, 'MVR')
  assert.equal(after.cashOwedCents - before.cashOwedCents, 20_000)
  assert.equal(after.commissionUnpaidCents - before.commissionUnpaidCents, 2_000)
})

test('Maldives buyer buys online in MVR', async () => {
  const hold = await api.holdNumbers('B-2001', { raffleId: mvRaffle.id, qty: 1 })
  const [t] = await api.buyOnline('B-2001', { holdId: hold.id })
  assert.equal(t.priceCents, 10_000)
})

test('a Maldives winner claims with the security code', async () => {
  const win = api.getBuyerTickets('B-2001').find((t) => t.status === 'won')
  assert.ok(win, 'demo buyer has a winning ticket')
  const code = await api.revealCode('B-2001', win.id)
  const res = await api.claimPrize('S-2001', { token: win.token, code })
  assert.equal(res.ok, true)
  assert.equal((await api.checkTicket({ token: win.token })).result, 'claimed')
})

test('only a Super Admin adds countries, with validation', async () => {
  await assert.rejects(api.createCountry(OP, base), /permission/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, code: 'UAE' }), /2 letters/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, currency: 'DH' }), /3-letter/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, timezone: 'Mars/Base' }), /time zone/)
  const c = await api.createCountry(ADMIN, base)
  assert.equal(c.enabled, false)
  assert.equal(c.legalStatus, 'pending')
  await assert.rejects(api.createCountry(ADMIN, base), /already added/)
})

test('a raffle cannot go on sale until the country is on and legally approved', async () => {
  aeRaffle = await api.createRaffle(OP, {
    countryId: 'AE', title: 'Dubai Test Draw', totalTickets: 1000, commissionPerEntryCents: 100,
    salesCloseAt: Date.now() + 86400000, drawAt: Date.now() + 2 * 86400000,
    prizes: [{ name: 'Cash AED 1,000', valueCents: 100_000, quantity: 1 }],
  })
  assert.equal(aeRaffle.mode, 'free_entry')
  await assert.rejects(api.publishRaffle(OP, aeRaffle.id), /switched off/)
  await api.updateCountry(ADMIN, 'AE', { enabled: true })
  await assert.rejects(api.publishRaffle(OP, aeRaffle.id), /legal approval/)
  await assert.rejects(api.setCountryLegal(ADMIN, 'AE', { approved: true, reference: ' ' }), /reference/)
  await api.setCountryLegal(ADMIN, 'AE', { approved: true, reference: 'Opinion ref 2026-11 (test)' })
  await api.publishRaffle(OP, aeRaffle.id)
  assert.equal(api.getRaffle(aeRaffle.id).status, 'on_sale')
})

test('free entry at a partner shop needs a receipt and moves no cash', async () => {
  aeSeller = await api.inviteSeller(OP, { name: 'Test Shop', mobile: '0500000000', area: 'Dubai', deviceId: 'D-01', countryId: 'AE' })
  await assert.rejects(api.sellPos('S-2001', { raffleId: aeRaffle.id, qty: 1, receiptRef: 'R1' }), /not available in your country/)
  await assert.rejects(api.sellPos(aeSeller.id, { raffleId: aeRaffle.id, qty: 1 }), /receipt/)
  const out = await api.sellPos(aeSeller.id, { raffleId: aeRaffle.id, qty: 2, receiptRef: 'INV-5521' })
  assert.equal(out[0].mode, 'free_entry')
  const bal = api.sellerBalances(aeSeller.id)
  assert.equal(bal.cashOwedCents, 0)
  assert.equal(bal.commissionUnpaidCents, 200)
  assert.equal(bal.currency, 'AED')
  await assert.rejects(api.sellPos(aeSeller.id, { raffleId: aeRaffle.id, qty: 1, receiptRef: 'INV-5521' }), /already given/)
})

test('online free entry is limited per day; paid flow is refused', async () => {
  await assert.rejects(api.holdNumbers('B-2002', { raffleId: aeRaffle.id, qty: 1 }), /free to enter/)
  const t = await api.enterFree('B-2002', { raffleId: aeRaffle.id })
  assert.equal(t.priceCents, 0)
  await assert.rejects(api.enterFree('B-2002', { raffleId: aeRaffle.id }), /tomorrow/)
})

test('switching a country off pauses sales; mode and currency are protected', async () => {
  await assert.rejects(api.updateCountry(ADMIN, 'MV', { mode: 'free_entry' }), /running raffles/)
  await assert.rejects(api.updateCountry(ADMIN, 'MV', { currency: 'USD' }), /cannot change/)
  await api.updateCountry(ADMIN, 'MV', { enabled: false })
  await assert.rejects(api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 1 }), /paused/)
})
