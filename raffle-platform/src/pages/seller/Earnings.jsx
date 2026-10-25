import { money } from '../../api/format.js'
import { getRaffles, sellerBalances, sellerRaffleSummary } from '../../api/server.js'
import { RaffleStatus } from '../../components/ui.jsx'
import { useDb } from '../../hooks.js'
import { useSession } from '../../session.jsx'

export default function Earnings() {
  useDb()
  const { user } = useSession()
  const bal = sellerBalances(user.id)
  const summary = sellerRaffleSummary(user.id)
  const current = summary.find((s) => s.raffle.status === 'on_sale') ?? summary[0]
  const anyOnSale = getRaffles().some((r) => r.status === 'on_sale' && r.countryId === user.countryId)

  return (
    <main className="content">
      {current && (
        <section className="card flat stack tight">
          <div className="small bold muted">Commission earned · {current.raffle.title}</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{money(current.commissionCents, current.raffle.currency)}</div>
          <div className="small muted">
            {current.raffle.mode === 'free_entry' ? (
              <>{current.sold} entries × {money(current.raffle.commissionPerEntryCents, current.raffle.currency)} per entry</>
            ) : (
              <>
                {current.sold} tickets × {money(current.raffle.priceCents, current.raffle.currency)} × <b style={{ color: 'var(--ink)' }}>{current.rate}%</b>
                {user.commissionOverride != null && ' (your personal rate)'}
              </>
            )}
          </div>
        </section>
      )}
      <div className="grid2">
        <div className="card flat"><div className="tiny bold muted">Cash to deposit</div><div className="bold" style={{ fontSize: 20 }}>{money(bal.cashOwedCents, bal.currency)}</div><div className="tiny muted">ticket cash held</div></div>
        <div className="card flat"><div className="tiny bold muted">Commission unpaid</div><div className="bold" style={{ fontSize: 20 }}>{money(bal.commissionUnpaidCents, bal.currency)}</div><div className="tiny muted">paid after sales close</div></div>
      </div>
      <section className="card flat stack" aria-label="Settle">
        <h2>Settle with the office</h2>
        <div className="row between small"><span>Cash held</span><span>{money(bal.cashOwedCents, bal.currency)}</span></div>
        <div className="row between small"><span>Less your commission</span><span>− {money(bal.commissionUnpaidCents, bal.currency)}</span></div>
        <div className="row between bold" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}><span>Net to deposit</span><span>{money(bal.cashOwedCents - bal.commissionUnpaidCents, bal.currency)}</span></div>
        {bal.pendingDepositsCents > 0 && <div className="tiny muted">{money(bal.pendingDepositsCents, bal.currency)} deposit waiting for confirmation.</div>}
        <div className="hint">Hand cash or a bank slip to the office. An operator records it and a Super Admin confirms it.{anyOnSale ? ' Commission is paid out after sales close.' : ''}</div>
      </section>
      <section className="card flat" aria-label="By raffle" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="label" style={{ padding: '10px 0 6px' }}>By raffle</div>
        <div className="list">
          {summary.map((s) => (
            <div key={s.raffle.id} className="list-row small">
              <div className="grow">
                <div className="bold">{s.raffle.title}</div>
                <div className="tiny muted">{s.raffle.mode === 'free_entry' ? `${s.sold} entries · per-entry fee` : `${s.sold} tickets · ${s.rate}%`}{s.voids ? ` · ${s.voids} void` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="bold">{money(s.commissionCents, s.raffle.currency)}</div>
                <RaffleStatus status={s.raffle.status} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
