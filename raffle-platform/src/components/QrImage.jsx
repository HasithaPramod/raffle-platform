import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function QrImage({ value, size = 180, label = 'Ticket QR code', className = '' }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size * 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''))
    return () => {
      alive = false
    }
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size, background: '#eef1f5', borderRadius: 8 }} aria-hidden="true" />
  return <img src={src} width={size} height={size} alt={label} className={className} style={{ imageRendering: 'pixelated' }} />
}
