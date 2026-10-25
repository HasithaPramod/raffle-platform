import { useState } from 'react'
import { dateTime } from '../../api/format.js'
import { getAudit, verifyAuditChain } from '../../api/server.js'
import { useDb } from '../../hooks.js'

export default function AuditLog() {
  useDb()
  const [filter, setFilter] = useState('')
  const [check, setCheck] = useState(null)
  const all = getAudit()
  const rows = all.filter((e) => !filter || `${e.action} ${e.actorId} ${JSON.stringify(e.detail)}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 300)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <div className="small muted">{all.length.toLocaleString()} entries. Each one includes the hash of the one before, so any edit or deletion is detected.</div>
        </div>
        <button className="btn dark" onClick={async () => setCheck(await verifyAuditChain())}>Verify the chain</button>
      </div>
      {check && (
        <div className={`result-hero ${check.ok ? 'good' : 'bad'}`}>
          <div className="bold">{check.ok ? `Chain intact: all ${check.count} entries verified` : `Chain broken at entry #${check.brokenAt}`}</div>
        </div>
      )}
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="flt">Filter</label>
        <input id="flt" className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="void, claim, S-1042…" />
      </div>
      <section className="card scroll-x">
        <table className="table" style={{ minWidth: 820 }}>
          <thead><tr><th>#</th><th>Time</th><th>Who</th><th>Action</th><th>Detail</th><th>Hash</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(e.at)}</td>
                <td>{e.actorId}</td>
                <td className="bold">{e.action}</td>
                <td className="mono tiny" style={{ maxWidth: 360, wordBreak: 'break-all' }}>{JSON.stringify(e.detail)}</td>
                <td className="mono tiny">{e.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
