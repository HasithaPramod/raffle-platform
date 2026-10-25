import { Link, useOutletContext } from 'react-router-dom'
import { dateTime } from '../../api/format.js'
import { getRaffles } from '../../api/server.js'
import { Icon, RaffleStatus } from '../../components/ui.jsx'
import { useDb } from '../../hooks.js'

const ORDER = { live: 0, sales_closed: 1, on_sale: 2, results: 3, settled: 4, cancelled: 5 }

export default function Draws() {
  useDb()
  const { country } = useOutletContext()
  const raffles = getRaffles()
    .filter((r) => r.status !== 'draft' && r.countryId === country?.id)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.drawAt - b.drawAt)
  return (
    <main className="content">
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Draws</h1>
      <div className="card list" style={{ padding: '0 14px' }}>
        {raffles.map((r) => (
          <Link key={r.id} to={`/buyer/live/${r.id}`} className="list-row" style={{ textDecoration: 'none', minHeight: 64 }}>
            <div className="grow">
              <div className="bold">{r.title}</div>
              <div className="tiny muted">{['results', 'settled'].includes(r.status) ? 'Drawn' : 'Draw'} {dateTime(r.drawAt, r.timezone)}</div>
            </div>
            <RaffleStatus status={r.status} />
            <Icon name="next" size={18} />
          </Link>
        ))}
      </div>
    </main>
  )
}
