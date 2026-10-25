// Ticket cryptography.
//
// In production all of this runs on the server and the private keys live in a
// KMS/HSM. In this prototype the "server" runs in the browser so the flows can
// be clicked through end to end; the API surface is the same.
//
// QR token format:  RFL1.<kid>.<iv+ciphertext>.<signature>   (base64url parts)
//   - payload {tid, rid, iat} is encrypted with AES-256-GCM (unreadable)
//   - "RFL1.<kid>.<ct>" is signed with ECDSA P-256 / SHA-256 (unforgeable)
//     (production: Ed25519 in the KMS; P-256 is used here because every
//      browser's WebCrypto supports it)

const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I

export function toB64u(bytes) {
  let s = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export function uuid() {
  return globalThis.crypto.randomUUID()
}

export async function sha256Hex(text) {
  return toHex(await subtle.digest('SHA-256', enc.encode(text)))
}

export function randomCode(len = 8) {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

// ---- keys -----------------------------------------------------------------

export async function generateKeys() {
  const sign = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  return {
    kid: 'k' + toHex(randomBytes(3)),
    signPriv: await subtle.exportKey('jwk', sign.privateKey),
    signPub: await subtle.exportKey('jwk', sign.publicKey),
    aes: await subtle.exportKey('jwk', aes),
  }
}

const keyCache = new Map()
async function importKeys(k) {
  if (keyCache.has(k.kid)) return keyCache.get(k.kid)
  const imported = {
    priv: await subtle.importKey('jwk', k.signPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    pub: await subtle.importKey('jwk', k.signPub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']),
    aes: await subtle.importKey('jwk', k.aes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
  }
  keyCache.set(k.kid, imported)
  return imported
}

// ---- symmetric helpers -------------------------------------------------------

export async function encryptText(keys, text) {
  const { aes } = await importKeys(keys)
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(text)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return toB64u(out)
}

export async function decryptText(keys, b64) {
  const { aes } = await importKeys(keys)
  const raw = fromB64u(b64)
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, aes, raw.slice(12))
  return dec.decode(pt)
}

// ---- QR token ----------------------------------------------------------------

export async function signTicketToken(keys, { tid, rid }) {
  const { priv } = await importKeys(keys)
  const ct = await encryptText(keys, JSON.stringify({ tid, rid, iat: Date.now() }))
  const body = `RFL1.${keys.kid}.${ct}`
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(body))
  return `${body}.${toB64u(sig)}`
}

// Returns {ok:true, tid, rid} or {ok:false, reason}
export async function verifyTicketToken(keyring, token) {
  if (typeof token !== 'string') return { ok: false, reason: 'not_a_ticket' }
  const parts = token.trim().split('.')
  if (parts.length !== 4 || parts[0] !== 'RFL1') return { ok: false, reason: 'not_a_ticket' }
  const keys = keyring.find((k) => k.kid === parts[1])
  if (!keys) return { ok: false, reason: 'unknown_key' }
  const { pub } = await importKeys(keys)
  let valid = false
  try {
    valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      fromB64u(parts[3]),
      enc.encode(parts.slice(0, 3).join('.')),
    )
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'bad_signature' }
  try {
    const payload = JSON.parse(await decryptText(keys, parts[2]))
    return { ok: true, tid: payload.tid, rid: payload.rid }
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
}

// ---- provably fair draw ------------------------------------------------------

async function hmacBytes(seedHex, message) {
  const key = await subtle.importKey('raw', enc.encode(seedHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle.sign('HMAC', key, enc.encode(message)))
}

// Pick `count` winners from `pool` (ticket numbers sorted ascending), skipping
// numbers already in `taken`. Deterministic for a given seed, so anyone with
// the revealed seed and the published ticket list can re-run it.
export async function pickWinners(seedHex, prizeId, pool, count, taken = []) {
  const remaining = pool.filter((n) => !taken.includes(n))
  const winners = []
  let round = 0
  while (winners.length < count && remaining.length > 0) {
    const h = await hmacBytes(seedHex, `${prizeId}:${round}`)
    const big = BigInt('0x' + toHex(h))
    const idx = Number(big % BigInt(remaining.length))
    winners.push(remaining.splice(idx, 1)[0])
    round++
  }
  return winners
}
