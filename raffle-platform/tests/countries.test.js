// Country management and free-entry mode: `npm test`
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import * as api from '../src/api/server.js'

const ADMIN = 'A-01'
const OP = 'O-01'
let mvRaffle

before(async () => {
  await api.resetDemo()
  mvRaffle = api.getRaffles().find((r) => r.countryId === 'MV')
})

const base = {
  code: 'AE', name: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai', languages: 'Arabic, English',
  mode: 'free_entry', idLabel: 'Emirates ID', approvalThresholdCents: 1_000_000, sellerPayoutLimitCents: 100_000,
  defaultFloatLimitCents: 0, paymentGateway: '', smsProvider: '',
}

test('only a Super Admin adds countries, with validation', async () => {
  await assert.rejects(api.createCountry(OP, base), /permission/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, code: 'UAE' }), /2 letters/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, currency: 'DH' }), /3-letter/)
  await assert.rejects(api.createCountry(ADMIN, { ...base, timezone: 'Mars/Base' }), /time zone/)
  const c = await api.createCountry(ADMIN, base)
  assert.equal(c.id, 'AE')
  assert.equal(c.enabled, false)
  assert.equal(c.legalStatus, 'pending')
  assert.deepEqual(c.languages, ['Arabic', 'English'])
  await assert.rejects(api.createCountry(ADMIN, base), /already added/)
})

test('a raffle cannot go on sale until the country is on and legally approved', async () => {
  assert.equal(mvRaffle.mode, 'free_entry')
  assert.equal(mvRaffle.currency, 'MVR')
  assert.equal(mvRaffle.priceCents, 0)
  await assert.rejects(api.publishRaffle(OP, mvRaffle.id), /switched off/)
  await api.updateCountry(ADMIN, 'MV', { enabled: true })
  await assert.rejects(api.publishRaffle(OP, mvRaffle.id), /legal approval/)
  await assert.rejects(api.setCountryLegal(ADMIN, 'MV', { approved: true, reference: ' ' }), /reference/)
  await api.setCountryLegal(ADMIN, 'MV', { approved: true, reference: 'Opinion ref 2026-11 (test)' })
  await api.publishRaffle(OP, mvRaffle.id)
  assert.equal(api.getRaffle(mvRaffle.id).status, 'on_sale')
})

test('free entry at a partner shop needs a receipt and moves no cash', async () => {
  await assert.rejects(api.sellPos('S-1042', { raffleId: mvRaffle.id, qty: 1, receiptRef: 'R1' }), /not available in your country/)
  await assert.rejects(api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 1 }), /receipt/)
  const out = await api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 2, receiptRef: 'INV-5521' })
  assert.equal(out.length, 2)
  assert.equal(out[0].currency, 'MVR')
  assert.equal(out[0].mode, 'free_entry')
  assert.equal(out[0].receiptRef, 'INV-5521')
  const bal = api.sellerBalances('S-2001')
  assert.equal(bal.cashOwedCents, 0)
  assert.equal(bal.commissionUnpaidCents, 2 * 500)
  assert.equal(bal.currency, 'MVR')
  await assert.rejects(api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 1, receiptRef: 'INV-5521' }), /already given/)
})

test('online free entry is limited per day; paid flow is refused', async () => {
  await assert.rejects(api.holdNumbers('B-2001', { raffleId: mvRaffle.id, qty: 1 }), /free to enter/)
  const t = await api.enterFree('B-2001', { raffleId: mvRaffle.id })
  assert.equal(t.priceCents, 0)
  await assert.rejects(api.enterFree('B-2001', { raffleId: mvRaffle.id }), /tomorrow/)
})

test('switching a country off pauses sales; mode and currency are protected', async () => {
  await assert.rejects(api.updateCountry(ADMIN, 'MV', { mode: 'paid' }), /running raffles/)
  await assert.rejects(api.updateCountry(ADMIN, 'MV', { currency: 'USD' }), /cannot change/)
  await api.updateCountry(ADMIN, 'MV', { enabled: false })
  await assert.rejects(api.sellPos('S-2001', { raffleId: mvRaffle.id, qty: 1, receiptRef: 'INV-9' }), /paused/)
})
