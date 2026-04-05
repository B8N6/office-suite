import { useEffect, useState } from 'react'
import { getCachedBranding } from '../../hooks/useBranding'

interface ServerInfo {
  serverTime: string
  timezone: string
  clientIp: string
  serverIp: string
  location: string
  mailboxHealth: string
  user?: string
  imapHost?: string
  smtpHost?: string
  version: string
}

export default function TickerBars() {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [localTime, setLocalTime] = useState('')

  // Live local clock (updates every second)
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setLocalTime(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ` +
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Server info refresh (every 30s)
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch('/api/server-info', { credentials: 'include' })
        if (res.ok) setInfo(await res.json())
      } catch {
        // silent
      }
    }
    fetchInfo()
    const id = setInterval(fetchInfo, 30_000)
    return () => clearInterval(id)
  }, [])

  const healthBadge = (h?: string) => {
    switch (h) {
      case 'ok':                return { txt: 'HEALTHY',   color: 'var(--green)' }
      case 'slow':              return { txt: 'SLOW',      color: '#fb923c' }
      case 'degraded':          return { txt: 'DEGRADED',  color: 'var(--red)' }
      case 'not-authenticated': return { txt: 'OFFLINE',   color: 'var(--dim)' }
      default:                  return { txt: '—',         color: 'var(--dim)' }
    }
  }
  const health = healthBadge(info?.mailboxHealth)

  const topItems = [
    `◉ ${localTime}`,
    `◈ B8N6 Office Suite v1.0.0`,
    `▸ MAILBOX: ${health.txt}`,
    `▸ CLIENT IP: ${info?.clientIp || '—'}`,
    `▸ SERVER IP: ${info?.serverIp || '—'}`,
    `▸ LOCATION: ${info?.location || '—'}`,
    `▸ IMAP: ${info?.imapHost || 'not connected'}`,
    `▸ SMTP: ${info?.smtpHost || 'not connected'}`,
    `◎ UPTIME: ONLINE`,
    `⬡ GPU CLUSTERS`,
    `◈ BARE METAL`,
    `⬢ 99.98% SLA`,
  ]

  const bottomItems = [
    '◉ B8N6 NETWORK',
    '▸ 8,192+ NODES',
    '▸ 3 REGIONS: US · AE · IN',
    '▸ ZERO TRUST',
    '▸ TLS 1.3',
    '▸ RFC-5322 COMPLIANT',
    '⬡ GPU CLUSTERS',
    '◈ BARE METAL',
    '◎ CLOUD INFRA',
    '⬢ ENTERPRISE GRADE',
  ]

  const branding = getCachedBranding()

  return (
    <>
      {branding.showTickerTop && (
        <div className="ticker-wrap">
          <div className="ticker-label">{branding.tickerTopLabel}</div>
          <div className="ticker-track">
            {[...topItems, ...topItems].map((item, i) => (
              <span key={i}>
                {item === `▸ MAILBOX: ${health.txt}` ? (
                  <>▸ MAILBOX: <span style={{ color: health.color, fontWeight: 700 }}>{health.txt}</span></>
                ) : item}
              </span>
            ))}
          </div>
        </div>
      )}

      {branding.showTickerBottom && (
        <div className="bticker-fixed">
          <div className="bticker-label">{branding.tickerBottomLabel}</div>
          <div className="bticker-track">
            {[...bottomItems, ...bottomItems].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
