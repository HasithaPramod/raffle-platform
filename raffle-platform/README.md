# Raffle Platform (React prototype)

A working React app for the raffle draw platform: the buyer website, the seller POS app and the admin panel in one project. Every flow in the spec works end to end against a mock backend that runs in the browser, so you can click through it today and swap in the real API later.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 14 backend flow tests (sell, reprint, void, claim, draw, audit)
npm run build        # production build in dist/
npm run build:demo   # one self-contained HTML file in dist-demo/ for sharing
```

Node 20 or newer.

## Try it

The app starts in the Maldives (MVR). Open the login page and pick who to be. Each browser tab has its own login, so you can be a buyer, a seller and the admin at once.

| Log in as | Try |
| --- | --- |
| Ahmed Shifaz (Maldives seller, PIN 1234) | Sell and print an MVR ticket, reprint it, void it, void and reissue |
| Aishath Ibrahim (Maldives buyer) | Buy a ticket online; My tickets shows a winning ticket from Hulhumalé Weekend Draw #50 and its security code |
| Mariyam Shiuna (Maldives seller) | Scan: pick Aishath's winning ticket, type the code, pay the prize |
| Hawwa Zahira (operator) | Live draw: close sales on Maldives Mega Draw #24, draw each tier, reveal the seed |
| Super Admin | Countries: add a country, record its approval, switch it on; approve big claims and deposits |

Sri Lanka (LKR) is set up as a second country with its own draws and sellers. "Reset demo data" on the login page starts over.

## What is implemented

- **Roles:** buyer, seller, operator, super admin, with permissions checked in every backend call.
- **Countries:** the Super Admin adds countries and sets each one's currency, time zone, languages, ID document, prize approval and seller payout limits, payment and SMS providers, and draw type. New countries start switched off with legal approval pending; raffles can be published only after approval is recorded with a reference. Switching a country off pauses all sales there. Raffles, sellers and buyers each belong to one country; amounts show in that country's currency and times in its time zone.
- **Two draw types per country:** *paid tickets* (buyers pay, sellers earn a percentage) or *free entry* (no payment to enter; partner sellers give entries against a purchase receipt and earn a fixed fee per entry; anyone can enter free online once a day). The Maldives is set up as paid tickets in MVR (record your government approval reference in Countries); free entry is there for countries that allow only free draws.
- **Ticket sales:** online purchase with a 10-minute number hold and optional seller code; POS sale with cash float limit.
- **Printing:** 58 mm thermal ticket with ticket number, signed QR, security code, seller, terminal, serial. Prints through the browser print dialog; the POS build will use the printer SDK.
- **QR security:** payload encrypted with AES-256-GCM and signed (ECDSA P-256 in the prototype, Ed25519 in production). Forged or edited codes fail. Ticket state lives only on the server.
- **Reprint:** same ticket, same QR, marked REPRINT n. One free reprint; more need operator approval.
- **Void:** reason + PIN; seller alone within 5 minutes, operator approval after that, none after sales close. Commission is reversed and a void slip prints. Void and reissue issues a new number and QR.
- **Claims:** scan (camera, photo or pasted code), signature check, status check, 8-character security code with 3 tries, seller payout limit, NIC and Super Admin approval for big prizes, one claim per ticket even under concurrent scans.
- **Commission:** percentage of each sale, per raffle with optional per-seller rate, fixed at the moment of sale; netted against cash or paid by bank.
- **Cash:** deposits recorded by an operator, confirmed by a Super Admin.
- **Live draw:** close sales (locks the ticket list, publishes the seed hash), draw each tier, results pushed live to buyers, reveal seed, public verifier page that re-runs the draw.
- **YouTube:** stream link per raffle, embedded on the buyer draw page.
- **Audit log:** every action, hash-chained, with a chain check.

## Your brand

Set the name, logo letters, tagline, contact details and licence number in `src/brand.js`. The buyer site, POS, admin and printed tickets all read from it.

## Project layout

```
src/
  api/
    server.js     mock backend: one exported function per API endpoint
    crypto.js     QR signing/encryption, security codes, provably fair draw
    store.js      localStorage database, cross-tab sync (stands in for WebSockets)
    format.js     money, ticket numbers, dates
  brand.js        brand name, contact details, licence number
  components/     layouts, ticket printing, QR scanner, prize illustrations, shared UI
  pages/
    buyer/        Home, Draws, RaffleDetail, LiveDraw, MyTickets, CheckTicket, Verify
    seller/       Sell, Scan, Earnings
    admin/        Dashboard, Raffles, DrawControl, Sellers, AuditLog
tests/server.test.js
```

## API map (for the real backend)

Each function in `src/api/server.js` becomes one endpoint. The pages already call them with `await`, so moving to HTTP means replacing each function body with a `fetch`.

| Function | Endpoint | Who |
| --- | --- | --- |
| holdNumbers, buyOnline | POST /raffles/:id/holds, POST /orders (confirmed by payment webhook) | buyer |
| enterFree | POST /raffles/:id/free-entries | buyer |
| createCountry, updateCountry, setCountryLegal | POST /countries, PATCH /countries/:id, POST /countries/:id/legal | super admin |
| revealCode | GET /tickets/:id/code | ticket owner |
| checkTicket | POST /tickets/check | public |
| sellPos | POST /pos/sales | seller |
| reprint | POST /tickets/:id/reprint | seller |
| voidTicket | POST /tickets/:id/void | seller |
| claimPrize | POST /claims | seller, operator, super admin |
| decideRequest, decideClaim, unlockTicket | POST /approvals/:id | operator / super admin |
| recordDeposit, decideDeposit | POST /deposits, POST /deposits/:id/decision | operator / super admin |
| payCommission, updateSeller, inviteSeller | /sellers/... | super admin / operator |
| createRaffle, updateRaffle, publishRaffle, cancelRaffle | /raffles/... | operator / super admin |
| closeSales, drawPrize, revealSeed | POST /raffles/:id/close, /draw, /reveal | operator / super admin |
| verifyDraw | runs in the browser from public data | anyone |

## Before going live

1. Move `server.js` to the backend (NestJS + PostgreSQL per the spec). Use real transactions with `SELECT … FOR UPDATE` on claims and sales.
2. Keep signing and encryption keys in a KMS/HSM; switch the signature to Ed25519; hash security codes with Argon2id.
3. Replace the demo login with mobile + OTP; bind each seller to their registered POS device.
4. Connect the payment gateway (tickets issued on the confirmed webhook) and an SMS gateway.
5. Wrap the seller app for Android POS terminals (for example Capacitor) and print through the terminal's printer SDK.
6. Replace cross-tab sync with WebSockets.
7. Record each country's real approval reference in Countries (replace the demo text for the Maldives and Sri Lanka).
8. Add translations (Dhivehi uses the right-to-left Thaana script) and the local payment and SMS providers per country.

Prizes, prices and names in the demo are sample data.
