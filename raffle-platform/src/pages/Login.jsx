import { useNavigate, useSearchParams } from 'react-router-dom'
import { getCountry, getUsers, resetDemo } from '../api/server.js'
import { BRAND } from '../brand.js'
import { Icon, useToast } from '../components/ui.jsx'
import { useDb } from '../hooks.js'
import { homeFor, useSession } from '../session.jsx'

const GROUPS = [
  { role: 'buyer', title: 'Buyer', body: 'Buy tickets online, watch the live draw, see e-tickets and security codes.' },
  { role: 'seller', title: 'Ticket seller (POS)', body: 'Sell and print tickets, reprint or void, scan and pay prizes, track commission. Demo PIN: 1234.' },
  { role: 'admin', title: 'Admin', body: 'Create raffles, run the live draw, approve voids, big claims and deposits, read the audit log.' },
]

export default function Login() {
  useDb()
  const { login } = useSession()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const next = params.get('next')

  function pick(u) {
    login(u.id)
    const home = homeFor(u.role)
    nav(next && next.startsWith(home) ? next : home)
  }

  return (
    <div className="login">
      <div className="row between wrap">
        <div className="brand" style={{ flex: 'none' }}><span className="logo">{BRAND.mark}</span>{BRAND.name}</div>
        <button className="btn sm" onClick={() => nav('/buyer')}>Browse raffles without logging in</button>
      </div>
      <div className="stack tight">
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Choose who to log in as</h1>
        <p className="muted" style={{ margin: 0 }}>
          This is a working prototype. Each browser tab has its own login, so open three tabs and be a buyer, a seller and the admin at once:
          results drawn in the admin tab appear live in the buyer tab.
        </p>
      </div>
      <div className="role-grid">
        {GROUPS.map((g) => {
          const users = getUsers().filter((u) => (g.role === 'admin' ? ['operator', 'super_admin'].includes(u.role) : u.role === g.role))
          return (
            <section key={g.role} className="card role-card">
              <h2>{g.title}</h2>
              <p className="small muted" style={{ margin: 0 }}>{g.body}</p>
              {users.map((u) => (
                <button key={u.id} className="user-btn" onClick={() => pick(u)}>
                  <span>
                    <span className="bold">{u.name}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {u.id}
                      {u.countryId ? ` · ${getCountry(u.countryId)?.name}` : ''}
                      {u.role === 'seller' ? ` · ${u.area} · terminal ${u.deviceId}` : ''}
                      {u.role === 'super_admin' ? ' · countries, claims, deposits, rates' : ''}
                      {u.role === 'operator' ? ' · runs draws, approves voids' : ''}
                    </span>
                  </span>
                  <Icon name="next" size={18} />
                </button>
              ))}
            </section>
          )
        })}
      </div>
      <div className="card small muted">
        Prizes, prices and names are sample data. Data is stored in this browser only.{' '}
        <button
          className="btn sm"
          onClick={async () => {
            await resetDemo()
            toast('Demo data reset')
          }}
        >
          Reset demo data
        </button>
      </div>
    </div>
  )
}
