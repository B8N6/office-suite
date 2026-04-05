import { useEffect, useState } from 'react'
import { getBranding, type Branding } from '../api/client'

const DEFAULT_BRANDING: Branding = {
  appName: 'B8N6 MAIL',
  tagline: 'Secure · Fast · Private',
  logo: '',
  logoLight: '',
  favicon: '',
  // Dark mode defaults
  colorPrimary: '#F5C400',
  colorPrimaryDim: '#b38e00',
  colorBackground: '#050505',
  colorText: '#F0EDE8',
  colorAccent: '#38bdf8',
  // Light mode defaults
  colorPrimaryLight: '#b38200',
  colorPrimaryDimLight: '#6b5000',
  colorBackgroundLight: '#ffffff',
  colorTextLight: '#000000',
  colorAccentLight: '#0284c7',
  tickerTopLabel: '▶ LIVE',
  tickerBottomLabel: 'B8N6',
  showTickerTop: true,
  showTickerBottom: true,
  supportEmail: '',
}

// Cache in-memory so branding applies before the first fetch returns.
let cached: Branding | null = null

// Domain-specific theme overrides applied on top of global branding.
// Server returns both dark and light palettes; we pick the right set based
// on the user's current colour-scheme preference.
export interface DomainTheme {
  colorPrimary?: string
  colorPrimaryDim?: string
  colorBackground?: string
  colorText?: string
  colorAccent?: string
  colorPrimaryLight?: string
  colorPrimaryDimLight?: string
  colorBackgroundLight?: string
  colorTextLight?: string
  colorAccentLight?: string
  logo?: string       // dark-mode logo
  logoLight?: string  // light-mode logo
}
let domainOverrides: DomainTheme | null = null

// Current color-scheme preference. Mutated via setColorScheme() from the
// mail store whenever the user toggles. Persisted separately in localStorage.
let currentScheme: 'dark' | 'light' = 'dark'
try {
  const saved = JSON.parse(localStorage.getItem('b8n6-mail-v2') || '{}')
  if (saved?.state?.theme === 'light') currentScheme = 'light'
} catch { /* ignore */ }

// Merge global branding with domain-level overrides (domain wins when set).
// Resolves to a single active palette based on `currentScheme` (dark/light)
// and picks the matching logo variant, falling back to the other side when
// a scheme-specific value isn't configured.
function mergeWithDomain(b: Branding): Branding {
  const pick = (override?: string, fallback?: string) =>
    (override && override.trim() ? override : fallback || '')

  // Active colour palette for the current scheme
  const activePrimary    = currentScheme === 'light'
    ? (b.colorPrimaryLight    || b.colorPrimary)
    : (b.colorPrimary         || b.colorPrimaryLight)
  const activePrimaryDim = currentScheme === 'light'
    ? (b.colorPrimaryDimLight || b.colorPrimaryDim)
    : (b.colorPrimaryDim      || b.colorPrimaryDimLight)
  const activeBg = currentScheme === 'light'
    ? (b.colorBackgroundLight || b.colorBackground)
    : (b.colorBackground      || b.colorBackgroundLight)
  const activeText = currentScheme === 'light'
    ? (b.colorTextLight || b.colorText)
    : (b.colorText      || b.colorTextLight)
  const activeAccent = currentScheme === 'light'
    ? (b.colorAccentLight || b.colorAccent)
    : (b.colorAccent      || b.colorAccentLight)

  // Active logo for current scheme (light → logoLight, dark → logo, each falls back)
  const globalLogo = currentScheme === 'light'
    ? (b.logoLight || b.logo)
    : (b.logo || b.logoLight)

  // Domain overrides: resolve its active palette + logo too, then merge.
  let domainPrimary = '', domainPrimaryDim = '', domainBg = '', domainText = '', domainAccent = '', domainLogo = ''
  if (domainOverrides) {
    domainPrimary = currentScheme === 'light'
      ? (domainOverrides.colorPrimaryLight || domainOverrides.colorPrimary || '')
      : (domainOverrides.colorPrimary || domainOverrides.colorPrimaryLight || '')
    domainPrimaryDim = currentScheme === 'light'
      ? (domainOverrides.colorPrimaryDimLight || domainOverrides.colorPrimaryDim || '')
      : (domainOverrides.colorPrimaryDim || domainOverrides.colorPrimaryDimLight || '')
    domainBg = currentScheme === 'light'
      ? (domainOverrides.colorBackgroundLight || domainOverrides.colorBackground || '')
      : (domainOverrides.colorBackground || domainOverrides.colorBackgroundLight || '')
    domainText = currentScheme === 'light'
      ? (domainOverrides.colorTextLight || domainOverrides.colorText || '')
      : (domainOverrides.colorText || domainOverrides.colorTextLight || '')
    domainAccent = currentScheme === 'light'
      ? (domainOverrides.colorAccentLight || domainOverrides.colorAccent || '')
      : (domainOverrides.colorAccent || domainOverrides.colorAccentLight || '')
    domainLogo = currentScheme === 'light'
      ? (domainOverrides.logoLight || domainOverrides.logo || '')
      : (domainOverrides.logo || domainOverrides.logoLight || '')
  }

  return {
    ...b,
    colorPrimary:    pick(domainPrimary,    activePrimary),
    colorPrimaryDim: pick(domainPrimaryDim, activePrimaryDim),
    colorBackground: pick(domainBg,         activeBg),
    colorText:       pick(domainText,       activeText),
    colorAccent:     pick(domainAccent,     activeAccent),
    logo:            pick(domainLogo,       globalLogo),
  }
}

function applyToDocument(b: Branding) {
  // Apply colour-scheme attribute — light-mode CSS vars live in globals.css
  document.documentElement.setAttribute('data-theme', currentScheme)

  // Title
  document.title = b.appName || 'B8N6 MAIL'

  // Favicon
  if (b.favicon) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = b.favicon
  }

  // Skip applying global theme to document if we're on the admin page —
  // admin has its own scoped theme (.admin-scope) that should win.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    // Also clear any previously-applied inline vars so the admin-scope
    // stylesheet takes over cleanly.
    const root = document.documentElement.style
    for (const v of ['--yl', '--ydim', '--bk', '--bk2', '--bk3', '--bk4', '--wh', '--blue', '--bd', '--bd2', '--bd3']) {
      root.removeProperty(v)
    }
    return
  }

  // Apply CSS variables that our theme actually reads
  const root = document.documentElement.style
  if (b.colorPrimary)    root.setProperty('--yl', b.colorPrimary)
  if (b.colorPrimaryDim) root.setProperty('--ydim', b.colorPrimaryDim)
  if (b.colorBackground) {
    root.setProperty('--bk', b.colorBackground)
    // Derive the layered bk2/bk3/bk4 shades from the base color
    root.setProperty('--bk2', shade(b.colorBackground, 0.03))
    root.setProperty('--bk3', shade(b.colorBackground, 0.06))
    root.setProperty('--bk4', shade(b.colorBackground, 0.10))
  }
  if (b.colorText)       root.setProperty('--wh', b.colorText)
  if (b.colorAccent)     root.setProperty('--blue', b.colorAccent)

  // Derived yellow-tinted borders so accents stay in sync
  if (b.colorPrimary) {
    const rgb = hexToRgb(b.colorPrimary)
    if (rgb) {
      root.setProperty('--bd', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`)
      root.setProperty('--bd2', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.26)`)
      root.setProperty('--bd3', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`)
    }
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

// Lighten a hex color by `amount` (0..1) — used to derive layered bg shades.
function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const shift = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(shift(rgb.r))}${toHex(shift(rgb.g))}${toHex(shift(rgb.b))}`
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(
    mergeWithDomain(cached || DEFAULT_BRANDING)
  )

  useEffect(() => {
    // Apply whatever we have cached immediately
    applyToDocument(mergeWithDomain(cached || DEFAULT_BRANDING))
    // Then fetch fresh from server
    getBranding()
      .then((r) => {
        cached = { ...DEFAULT_BRANDING, ...r.data }
        const merged = mergeWithDomain(cached)
        applyToDocument(merged)
        setBranding(merged)
      })
      .catch(() => {
        // fall back to defaults silently
      })
  }, [])

  return branding
}

// Synchronously returns the cached branding (or defaults) —
// useful for components that render before the hook's effect runs.
export function getCachedBranding(): Branding {
  return mergeWithDomain(cached || DEFAULT_BRANDING)
}

// Apply per-domain theme overrides and re-paint the document immediately.
// Called after login or when switching accounts. Accepts either the
// DomainTheme shape or the auth response shape (which uses `icon`/`iconLight`
// field names instead of `logo`/`logoLight`).
export function setDomainTheme(
  theme: DomainTheme | (Partial<DomainTheme> & { icon?: string; iconLight?: string }) | null
) {
  if (!theme) { domainOverrides = null }
  else {
    domainOverrides = {
      colorPrimary: theme.colorPrimary,
      colorPrimaryDim: theme.colorPrimaryDim,
      colorBackground: theme.colorBackground,
      colorText: theme.colorText,
      colorAccent: theme.colorAccent,
      colorPrimaryLight: theme.colorPrimaryLight,
      colorPrimaryDimLight: theme.colorPrimaryDimLight,
      colorBackgroundLight: theme.colorBackgroundLight,
      colorTextLight: theme.colorTextLight,
      colorAccentLight: theme.colorAccentLight,
      // Accept either explicit logo/logoLight or the auth-response icon/iconLight
      logo: theme.logo || (theme as { icon?: string }).icon || '',
      logoLight: theme.logoLight || (theme as { iconLight?: string }).iconLight || '',
    }
  }
  applyToDocument(mergeWithDomain(cached || DEFAULT_BRANDING))
}

// Switch the dark/light colour scheme and re-paint the document.
// Called from the mail store's toggleTheme action.
export function setColorScheme(scheme: 'dark' | 'light') {
  currentScheme = scheme
  applyToDocument(mergeWithDomain(cached || DEFAULT_BRANDING))
}
