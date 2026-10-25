import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getCountries } from '../api/server.js'
import { BRAND } from '../brand.js'
import { useDb } from '../hooks.js'
import { useSession } from '../session.jsx'
import { Icon } from './ui.jsx'

export function RequireRole({ roles, children }) {
  const { user } = useSession()
  const loc = useLocation()
  if (!user || !roles.includes(user.role)) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return children
}

const PREF = 'raffle-country'
function readPref() {
  try {
    return localStorage.getItem(PREF)
  } catch {
    return null
  }
}

export function BuyerLayout() {
  useDb()
  const { user, logout } = useSession()
  const nav = useNavigate()
  const isBuyer = user?.role === 'buyer'
  const countries = getCountries().filter((c) => c.enabled)
  const [picked, setPicked] = useState(readPref)
  const wanted = picked ?? (isBuyer ? user.countryId : null)
  const country = countries.find((c) => c.id === wanted) ?? countries[0] ?? null
  function choose(id) {
    setPicked(id)
    try {
      localStorage.setItem(PREF, id)
    } catch {
      /* remembered for this visit only */
    }
  }
  return (
    <div className="site">
      <header className="site-header">
        <div className="wrap site-header-row">
        <Link to="/buyer" className="brand"><span className="logo">{BRAND.mark}</span>{BRAND.name}</Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/buyer" end>Home</NavLink>
          <NavLink to="/buyer/draws">Draws</NavLink>
          <NavLink to="/buyer/tickets">My tickets</NavLink>
          <NavLink to="/buyer/check">Check a ticket</NavLink>
        </nav>
        <div className="row" style={{ gap: 8 }}>
        {countries.length > 1 && (
          <>
            <label htmlFor="country-pick" className="sr-only">Country</label>
            <select id="country-pick" className="input" style={{ width: 'auto', minHeight: 36, fontSize: 13, fontWeight: 700 }} value={country?.id} onChange={(e) => choose(e.target.value)}>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </>
        )}
        {isBuyer ? (
          <button className="btn sm" onClick={() => { logout(); nav('/buyer') }} title={`Logged in as ${user.name}`}>
            <Icon name="logout" size={16} /> {user.name.split(' ')[0]}
          </button>
        ) : (
          <Link className="btn sm" to="/login?next=/buyer">Log in</Link>
        )}
        </div>
        </div>
      </header>
      <Outlet context={{ country }} />
      <nav className="bottomnav site-bottomnav" aria-label="Main">
        <NavLink to="/buyer" end><Icon name="home" />Home</NavLink>
        <NavLink to="/buyer/draws"><Icon name="play" />Draws</NavLink>
        <NavLink to="/buyer/tickets"><Icon name="ticket" />My tickets</NavLink>
        <NavLink to="/buyer/check"><Icon name="scan" />Check</NavLink>
      </nav>
    </div>
  )
}

export function PosLayout() {
  const { user, logout } = useSession()
  const nav = useNavigate()
  return (
    <div className="phone pos">
      <header className="topbar dark">
        <div className="grow">
          <div className="bold">Seller {user.id}</div>
          <div className="tiny" style={{ color: '#c9d3df' }}>{user.name} · Terminal {user.deviceId} · {user.area}</div>
        </div>
        <span className="badge" style={{ background: '#8fe3c8', color: '#0f1b2d' }}>Online</span>
        <button className="btn ghost icon-btn" aria-label="Log out" onClick={() => { logout(); nav('/login') }}><Icon name="logout" /></button>
      </header>
      <Outlet />
      <nav className="bottomnav" aria-label="POS">
        <NavLink to="/pos" end><Icon name="ticket" />Sell</NavLink>
        <NavLink to="/pos/scan"><Icon name="scan" />Scan</NavLink>
        <NavLink to="/pos/earnings"><Icon name="trend" />Earnings</NavLink>
      </nav>
    </div>
  )
}

export function AdminLayout() {
  const { user, logout } = useSession()
  const nav = useNavigate()
  const items = [
    ['/admin', 'dashboard', 'Dashboard', true],
    ['/admin/raffles', 'list', 'Raffles'],
    ['/admin/draw', 'play', 'Live draw'],
    ['/admin/sellers', 'users', 'Sellers and cash'],
    ['/admin/countries', 'globe', 'Countries'],
    ['/admin/audit', 'log', 'Audit log'],
  ]
  return (
    <div className="admin">
      <nav className="sidebar" aria-label="Admin">
        <Link to="/admin" className="brand"><span className="logo">{BRAND.mark}</span>{BRAND.name} Admin</Link>
        {items.map(([to, icon, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav row ${isActive ? 'active' : ''}`}>
            <Icon name={icon} size={18} /> {label}
          </NavLink>
        ))}
        <div className="who">
          <div className="bold" style={{ color: '#fff' }}>{user.name}</div>
          <div>{user.role === 'super_admin' ? 'Super Admin' : 'Operator'} · {user.id}</div>
          <button className="btn sm" style={{ marginTop: 10, background: 'transparent', color: '#fff', borderColor: '#3a4a62' }} onClick={() => { logout(); nav('/login') }}>
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
