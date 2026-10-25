import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { countdown, dateTime, money, pad2, parseTicketNo, prizeLabel, ticketNo } from '../../api/format.js'
import { checkTicket, getRaffles, raffleStats } from '../../api/server.js'
import { BRAND } from '../../brand.js'
import { CheckResult } from '../../components/CheckResult.jsx'
import { PrizeArt } from '../../components/PrizeArt.jsx'
import { Icon } from '../../components/ui.jsx'
import { useDb, useNow } from '../../hooks.js'

export function Countdown({ to, light = false }) {
  useNow(1000)
  const c = countdown(to)
  return (
    <div className={`count ${light ? 'light' : ''}`} role="timer" aria-label="Time to the draw">
      <div><b>{pad2(c.d)}</b><span>days</span></div>
      <div><b>{pad2(c.h)}</b><span>hours</span></div>
      <div><b>{pad2(c.m)}</b><span>min</span></div>
      <div><b>{pad2(c.s)}</b><span>sec</span></div>
    </div>
  )
}

function winLine(prize, currency) {
  if (!prize) return 'Win big'
  if (/^cash\b/i.test(prize.name) || prize.name.toUpperCase().includes(currency)) return `Win ${prize.name}`
  return `Win ${/^[aeiou]/i.test(prize.name) ? 'an' : 'a'} ${prize.name}`
}

const totalPrizes = (r) => r.prizes.reduce((a, p) => a + p.quantity, 0)

function cta(r) {
  return r.mode === 'free_entry' ? 'Enter free' : `Buy a ticket · ${money(r.priceCents, r.currency)}`
}

// A raffle shown as a ticket stub: prize side, perforation, then the stub.
export function RaffleCard({ raffle, i = 0 }) {
  const stats = raffleStats(raffle.id)
  const top = raffle.prizes[0]
  const pct = Math.min(100, (stats.sold / raffle.totalTickets) * 100)
  return (
    <article className={`stub tone-${i % 3}`}>
      <div className="stub-main">
        <div className="stub-art"><PrizeArt name={top?.name} /></div>
        <div className="stub-body">
          <div className="eyebrow">{raffle.title}</div>
          <h3 className="stub-title">{winLine(top, raffle.currency)}</h3>
          <div className="small muted">
            {totalPrizes(raffle)} prizes · draw {dateTime(raffle.drawAt, raffle.timezone)}
          </div>
          <div className="meter" aria-label={`${Math.round(pct)}% taken`}><div style={{ width: `${Math.max(pct, 1.5)}%` }} /></div>
          <div className="tiny muted">{stats.sold.toLocaleString()} of {raffle.totalTickets.toLocaleString()} {raffle.mode === 'free_entry' ? 'entries given' : 'tickets sold'}</div>
        </div>
      </div>
      <div className="stub-tear" aria-hidden="true" />
      <div className="stub-side">
        <div className="stub-price">
          {raffle.mode === 'free_entry' ? (
            <>
              <span className="stub-price-big">Free</span>
              <span className="tiny">no purchase needed</span>
            </>
          ) : (
            <>
              <span className="tiny">{raffle.currency}</span>
              <span className="stub-price-big">{(raffle.priceCents / 100).toLocaleString()}</span>
              <span className="tiny">per ticket</span>
            </>
          )}
        </div>
        <Link className="btn primary" to={`/buyer/raffle/${raffle.id}`}>{raffle.mode === 'free_entry' ? 'Enter' : 'Buy'}</Link>
      </div>
    </article>
  )
}

function QuickCheck({ raffles }) {
  const [raffleId, setRaffleId] = useState('')
  const [number, setNumber] = useState('')
  const [res, setRes] = useState(null)
  const selected = raffles.some((r) => r.id === raffleId) ? raffleId : raffles[0]?.id
  async function submit(e) {
    e.preventDefault()
    const n = parseTicketNo(number)
    if (Number.isNaN(n) || !selected) return
    setRes(await checkTicket({ raffleId: selected, number: n }))
  }
  return (
    <div className="stack">
      <form className="quick-check" onSubmit={submit}>
        <div className="field">
          <label htmlFor="qc-raffle">Draw</label>
          <select id="qc-raffle" className="input" value={selected ?? ''} onChange={(e) => setRaffleId(e.target.value)}>
            {raffles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qc-number">Ticket number</label>
          <input id="qc-number" className="input mono" inputMode="numeric" placeholder="06 418" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <button className="btn dark" type="submit">Check</button>
      </form>
      <CheckResult res={res} />
      <Link className="small bold" to="/buyer/check">Or scan the QR on your ticket</Link>
    </div>
  )
}

export default function Home() {
  useDb()
  const { country } = useOutletContext()
  const raffles = getRaffles().filter((r) => r.countryId === country?.id)
  const open = raffles.filter((r) => r.status === 'on_sale').sort((a, b) => a.drawAt - b.drawAt)
  const live = raffles.find((r) => r.status === 'live')
  const next = live ?? raffles.filter((r) => ['on_sale', 'sales_closed'].includes(r.status)).sort((a, b) => a.drawAt - b.drawAt)[0]
  const latest = raffles.filter((r) => ['results', 'settled'].includes(r.status)).sort((a, b) => b.drawAt - a.drawAt)[0]
  const checkable = raffles.filter((r) => r.status !== 'draft')
  const free = country?.mode === 'free_entry'
  const top = next?.prizes[0]

  return (
    <main className="home">
      {live && (
        <Link to={`/buyer/live/${live.id}`} className="live-strip">
          <span className="wrap row">
            <span className="badge live">● LIVE NOW</span>
            <span className="grow"><b>{live.title}</b>: winning numbers are being drawn</span>
            <span className="bold">Watch →</span>
          </span>
        </Link>
      )}

      <section className="hero-band" aria-label="Next draw">
        <div className="wrap hero-grid">
          {next ? (
            <>
              <div className="hero-copy">
                <div className="eyebrow light">{live ? 'Drawing live now' : `Next live draw · ${dateTime(next.drawAt, next.timezone)}`}</div>
                <h1 className="hero-title">{winLine(top, next.currency)}</h1>
                <p className="hero-sub">
                  {next.title}: {totalPrizes(next)} prizes, drawn live on YouTube.{' '}
                  {next.mode === 'free_entry' ? 'Free to enter, no purchase needed.' : 'Every ticket can be checked for itself.'}
                </p>
                {!live && <Countdown to={next.drawAt} />}
                <div className="row wrap">
                  {next.status === 'on_sale' && <Link className="btn primary big-inline" to={`/buyer/raffle/${next.id}`}>{cta(next)}</Link>}
                  <Link className="btn ghost-light big-inline" to={`/buyer/live/${next.id}`}><Icon name="play" size={20} /> {live ? 'Watch the draw' : 'Draw page'}</Link>
                </div>
              </div>
              <div className="hero-ticket" aria-hidden="true">
                <div className="hero-ticket-card">
                  <div className="hero-ticket-top">
                    <span className="eyebrow">{BRAND.name}</span>
                    <span className="mono tiny">{next.code}</span>
                  </div>
                  <PrizeArt name={top?.name} className="hero-art" />
                  <div className="hero-ticket-prize">{prizeLabel(top, next.currency)}</div>
                  <div className="hero-ticket-tear" />
                  <div className="hero-ticket-bottom">
                    <div>
                      <div className="tiny muted">TICKET NO.</div>
                      <div className="hero-ticket-no">07 777</div>
                    </div>
                    <svg width="54" height="54" viewBox="0 0 7 7" shapeRendering="crispEdges"><path fill="currentColor" d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" /></svg>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="hero-copy">
              <div className="eyebrow light">{country?.name ?? 'Welcome'}</div>
              <h1 className="hero-title">New draws are coming soon</h1>
              <p className="hero-sub">Check back here for the next live draw.</p>
            </div>
          )}
        </div>
      </section>

      <section className="wrap section" aria-labelledby="open-h">
        <div className="section-head">
          <h2 id="open-h">Open draws</h2>
          <Link className="small bold" to="/buyer/draws">All draws and results →</Link>
        </div>
        {open.length ? (
          <div className="stub-grid">{open.map((r, i) => <RaffleCard key={r.id} raffle={r} i={i} />)}</div>
        ) : (
          <div className="card muted">{country ? `No draws are open in ${country.name} right now.` : 'No countries are open yet.'}</div>
        )}
      </section>

      <section className="wrap section" aria-labelledby="how-h">
        <div className="section-head"><h2 id="how-h">How it works</h2></div>
        <ol className="steps">
          <li>
            <span className="step-no">1</span>
            <h3>{free ? 'Get a free entry' : 'Get a ticket'}</h3>
            <p>{free ? 'Ask for an entry when you shop at a partner store, or enter free online once a day.' : 'Buy online in a minute, or from a seller near you who prints it on the spot.'} Each one has a signed QR and a hidden security code.</p>
          </li>
          <li>
            <span className="step-no">2</span>
            <h3>Watch the live draw</h3>
            <p>Every draw is streamed on YouTube. Winning numbers appear on this site the moment they are drawn.</p>
          </li>
          <li>
            <span className="step-no">3</span>
            <h3>Claim your prize</h3>
            <p>Show your QR and security code to any seller or at our office. Big prizes need your {country?.idLabel ?? 'ID'}.</p>
          </li>
        </ol>
      </section>

      <section className="fair-band" aria-labelledby="fair-h">
        <div className="wrap section">
          <div className="section-head"><h2 id="fair-h">Fair, and you can check it</h2></div>
          <div className="fair-grid">
            <div className="fair-item">
              <span className="fair-icon"><Icon name="shield" size={26} /></span>
              <h3>Tickets that can't be faked</h3>
              <p>Every QR is encrypted and digitally signed. A copied or edited ticket fails the moment it is scanned, and each prize can be claimed only once.</p>
            </div>
            <div className="fair-item">
              <span className="fair-icon"><Icon name="play" size={26} /></span>
              <h3>Drawn live, in public</h3>
              <p>Each draw runs live on YouTube, and the result reaches this site at the same moment. Replays stay up afterwards.</p>
            </div>
            <div className="fair-item">
              <span className="fair-icon"><Icon name="check" size={26} /></span>
              <h3>Check the maths yourself</h3>
              <p>We publish a sealed code before each draw and reveal it after. Anyone can re-run the draw and get the same winners.</p>
              {latest?.seed && <Link className="small bold" to={`/buyer/verify/${latest.id}`}>Verify {latest.title} →</Link>}
            </div>
          </div>
        </div>
      </section>

      <div className="wrap section split">
        {latest && (
          <section className="card results-card" aria-labelledby="res-h">
            <div className="eyebrow">Latest results · {dateTime(latest.drawAt, latest.timezone)}</div>
            <h2 id="res-h">{latest.title}</h2>
            {latest.results.map((r) => {
              const p = latest.prizes.find((x) => x.id === r.prizeId)
              const first = p.tier === 1
              return (
                <div key={r.prizeId} className="stack tight">
                  <span className="tiny bold muted">{prizeLabel(p, latest.currency).toUpperCase()}</span>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {r.numbers.slice(0, 8).map((n) => first ? <span key={n} className="ticket-no big-no">{ticketNo(n)}</span> : <span key={n} className="num-chip">{ticketNo(n)}</span>)}
                    {r.numbers.length > 8 && <span className="tiny muted">+{r.numbers.length - 8} more</span>}
                  </div>
                </div>
              )
            })}
            <div className="row wrap">
              <Link className="btn sm" to={`/buyer/live/${latest.id}`}>All winning numbers</Link>
              {latest.seed && <Link className="btn sm" to={`/buyer/verify/${latest.id}`}>Verify this draw</Link>}
            </div>
          </section>
        )}
        <section className="card" aria-labelledby="chk-h">
          <div className="eyebrow">Paper ticket?</div>
          <h2 id="chk-h">Did you win?</h2>
          {checkable.length ? <QuickCheck raffles={checkable} /> : <div className="muted small">Nothing to check yet.</div>}
        </section>
      </div>

      <section className="seller-band" aria-labelledby="sell-h">
        <div className="wrap seller-grid">
          <div>
            <div className="eyebrow light">For shops and agents</div>
            <h2 id="sell-h">{free ? 'Give free entries at your shop' : 'Sell tickets in your area'}</h2>
            <p className="hero-sub">
              {free
                ? 'Customers get a free entry with their purchase, and you earn a fee for every entry you give.'
                : 'Earn commission on every ticket you sell, see your earnings live, and settle with us in a few taps.'}
            </p>
          </div>
          <ul className="seller-points">
            <li><Icon name="printer" size={20} /> Print tickets on a POS terminal</li>
            <li><Icon name="scan" size={20} /> Scan and pay small prizes on the spot</li>
            <li><Icon name="trend" size={20} /> Track your {free ? 'fees' : 'commission'} every day</li>
            <li className="contact"><span>Call <b className="selectable">{BRAND.contactPhone}</b> or email <b className="selectable">{BRAND.contactEmail}</b></span></li>
          </ul>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="stack tight">
            <div className="brand light"><span className="logo">{BRAND.mark}</span>{BRAND.name}</div>
            <span className="small">{BRAND.tagline}</span>
          </div>
          <nav className="stack tight small" aria-label="Footer">
            <Link to="/buyer/draws">Draws and results</Link>
            <Link to="/buyer/check">Check a ticket</Link>
            <Link to="/buyer/tickets">My tickets</Link>
          </nav>
          <div className="stack tight small">
            <span>{country ? `${country.name} · ${country.currency}` : ''}</span>
            <span>{free ? 'No purchase needed to enter.' : '18+ only. Play responsibly.'}</span>
            <span>{BRAND.licence}</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
