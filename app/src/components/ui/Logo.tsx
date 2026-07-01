interface LogoProps {
  size?: number
  withText?: boolean
  variant?: 'auth' | 'topbar'
  className?: string
}

const TEXT_STYLES = {
  auth: {
    gap: '10px',
    main: { fontSize: '22px', fontWeight: 400, letterSpacing: '.22em', textTransform: 'uppercase' as const, color: 'var(--color-text)', lineHeight: 1.1 },
    sub: { fontSize: '9px', fontWeight: 400, letterSpacing: '.35em', textTransform: 'uppercase' as const, color: 'var(--color-accent)' },
  },
  topbar: {
    gap: '8px',
    main: { fontSize: '14px', fontWeight: 400, letterSpacing: '.22em', textTransform: 'uppercase' as const, color: 'var(--color-text)', lineHeight: 1.1 },
    sub: { fontSize: '6px', fontWeight: 400, letterSpacing: '.3em', textTransform: 'uppercase' as const, color: 'var(--color-accent)' },
  },
}

export function Logo({ size = 32, withText = false, variant = 'topbar', className = '' }: LogoProps) {
  const t = TEXT_STYLES[variant]
  return (
    <div className={`flex items-center ${className}`} style={{ gap: withText ? t.gap : 0 }}>
      <svg width={size} height={size} viewBox="0 0 72 72" fill="none" className="shrink-0">
        <rect x="4" y="4" width="64" height="64" rx="5" stroke="var(--color-accent)" strokeWidth="5" fill="none" />
        <rect x="19" y="19" width="34" height="34" rx="2" stroke="var(--color-accent)" strokeWidth="3.5" fill="none" />
        <circle cx="36" cy="36" r="4" fill="var(--color-accent)" />
      </svg>
      {withText && (
        <div className="flex flex-col">
          <span style={t.main}>Atrium</span>
          <span style={t.sub}>Casa</span>
        </div>
      )}
    </div>
  )
}
