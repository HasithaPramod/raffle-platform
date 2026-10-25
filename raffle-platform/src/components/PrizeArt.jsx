// Flat illustrations for prize types, coloured through CSS variables so the
// same drawing works on the dark hero and on light cards:
//   --art-main (body), --art-ink (tyres, outlines), --art-glass, --art-light
export function prizeKind(name = '') {
  const n = name.toLowerCase()
  if (n.includes('car') || n.includes('suv') || n.includes('van')) return 'car'
  if (n.includes('bike') || n.includes('motor') || n.includes('scooter')) return 'bike'
  if (n.includes('voucher') || n.includes('gift')) return 'voucher'
  return 'cash'
}

function Car() {
  return (
    <>
      <ellipse cx="122" cy="136" rx="98" ry="8" fill="var(--art-ink)" opacity="0.18" />
      <path d="M26 106c2-14 12-22 30-25l26-21c8-6 16-8 26-8h44c12 0 22 4 30 12l20 18c18 2 28 10 30 22v8c0 6-4 10-10 10H36c-6 0-10-4-10-10z" fill="var(--art-main)" />
      <path d="M86 66l14-8h28v24H74zM136 58h16c9 0 16 3 22 9l15 15h-53z" fill="var(--art-glass)" />
      <path d="M26 104h18v6H26zM204 98h14v8h-14z" fill="var(--art-light)" />
      <path d="M131 58v62" stroke="var(--art-ink)" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="72" cy="120" r="19" fill="var(--art-ink)" />
      <circle cx="72" cy="120" r="8" fill="var(--art-light)" />
      <circle cx="180" cy="120" r="19" fill="var(--art-ink)" />
      <circle cx="180" cy="120" r="8" fill="var(--art-light)" />
    </>
  )
}

function Bike() {
  return (
    <>
      <ellipse cx="122" cy="140" rx="96" ry="7" fill="var(--art-ink)" opacity="0.18" />
      <circle cx="62" cy="112" r="26" fill="none" stroke="var(--art-ink)" strokeWidth="9" />
      <circle cx="184" cy="112" r="26" fill="none" stroke="var(--art-ink)" strokeWidth="9" />
      <circle cx="62" cy="112" r="6" fill="var(--art-light)" />
      <circle cx="184" cy="112" r="6" fill="var(--art-light)" />
      <path d="M62 112l34-34h52l36 34" fill="none" stroke="var(--art-ink)" strokeWidth="7" strokeLinejoin="round" />
      <path d="M98 74c4-14 18-20 34-20h14c10 0 16 6 16 14v6H98z" fill="var(--art-main)" />
      <path d="M66 70h40c4 0 6 2 6 5H72c-4 0-6-2-6-5z" fill="var(--art-ink)" />
      <path d="M184 112l-22-56M154 50l20-8" fill="none" stroke="var(--art-ink)" strokeWidth="7" strokeLinecap="round" />
      <path d="M176 64h18v10h-18z" fill="var(--art-light)" />
      <path d="M104 92h40l-6 14h-28z" fill="var(--art-main)" />
    </>
  )
}

function Cash() {
  return (
    <>
      <ellipse cx="120" cy="138" rx="92" ry="7" fill="var(--art-ink)" opacity="0.18" />
      <g transform="rotate(-8 120 90)">
        <rect x="44" y="52" width="150" height="76" rx="10" fill="var(--art-glass)" />
      </g>
      <g transform="rotate(4 120 90)">
        <rect x="46" y="48" width="150" height="76" rx="10" fill="var(--art-main)" />
        <rect x="56" y="58" width="130" height="56" rx="6" fill="none" stroke="var(--art-ink)" strokeOpacity="0.35" strokeWidth="2" />
        <circle cx="121" cy="86" r="17" fill="none" stroke="var(--art-ink)" strokeOpacity="0.5" strokeWidth="3" />
        <path d="M121 76v20M114 81h11a4 4 0 0 1 0 8h-8a4 4 0 0 0 0 8h11" stroke="var(--art-ink)" strokeOpacity="0.6" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <circle cx="194" cy="122" r="16" fill="var(--art-light)" stroke="var(--art-ink)" strokeOpacity="0.3" strokeWidth="3" />
      <circle cx="170" cy="130" r="12" fill="var(--art-light)" stroke="var(--art-ink)" strokeOpacity="0.3" strokeWidth="3" />
    </>
  )
}

function Voucher() {
  return (
    <>
      <ellipse cx="120" cy="138" rx="92" ry="7" fill="var(--art-ink)" opacity="0.18" />
      <g transform="rotate(-6 120 88)">
        <rect x="40" y="44" width="160" height="90" rx="12" fill="var(--art-main)" />
        <rect x="40" y="76" width="160" height="14" fill="var(--art-glass)" />
        <rect x="96" y="44" width="14" height="90" fill="var(--art-glass)" />
        <path d="M103 76c-14-22-34-14-26-4 6 7 26 4 26 4zm0 0c14-22 34-14 26-4-6 7-26 4-26 4z" fill="var(--art-light)" stroke="var(--art-ink)" strokeOpacity="0.4" strokeWidth="2" />
        <rect x="128" y="104" width="56" height="8" rx="4" fill="var(--art-ink)" opacity="0.35" />
      </g>
    </>
  )
}

export function PrizeArt({ name, className = '', label }) {
  const kind = prizeKind(name)
  return (
    <svg viewBox="0 0 244 150" className={`prize-art ${className}`} role="img" aria-label={label ?? `Illustration: ${name}`}>
      {kind === 'car' && <Car />}
      {kind === 'bike' && <Bike />}
      {kind === 'cash' && <Cash />}
      {kind === 'voucher' && <Voucher />}
    </svg>
  )
}
