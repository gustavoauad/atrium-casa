import { fm } from '../../lib/payroll/format'

const PIE_COLORS = ['#8B6F47', '#6B8F71', '#8ABDD8', '#C47A2A', '#B04A4A', '#C4973A', '#8C8278', '#5B8FAF']

export interface MonthBar {
  label: string
  value: number
  current?: boolean
}

export function BarChart({ title, bars }: { title: string; bars: MonthBar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1)
  return (
    <div className="border border-border rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-4">{title}</p>
      <div className="flex items-end gap-2 h-32 overflow-x-auto">
        {bars.map((b, i) => {
          const h = Math.max(Math.round((b.value / max) * 100), 3)
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 w-11 shrink-0">
              <span className="text-[9px] text-muted whitespace-nowrap">{b.value > 0 ? `R$ ${fm(b.value)}` : ''}</span>
              <div
                className={`w-full rounded-t ${b.current ? 'bg-accent' : 'bg-accent-2/60'}`}
                style={{ height: `${h}px` }}
              />
              <span className="text-[10px] text-muted truncate w-full text-center">{b.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DonutChart({ title, paid, total }: { title: string; paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0
  const circumference = 2 * Math.PI * 40
  const dash = (pct / 100) * circumference
  return (
    <div className="border border-border rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-4">{title}</p>
      <div className="flex items-center gap-5">
        <svg width={96} height={96} viewBox="0 0 96 96" className="shrink-0">
          <circle cx={48} cy={48} r={40} fill="none" stroke="var(--color-border)" strokeWidth={10} />
          <circle
            cx={48}
            cy={48}
            r={40}
            fill="none"
            stroke="var(--color-sage)"
            strokeWidth={10}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
          />
          <text x={48} y={54} textAnchor="middle" fontSize={20} fill="var(--color-text)">
            {pct}%
          </text>
        </svg>
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sage" /> {paid} pago{paid !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-border" /> {total - paid} pendente{total - paid !== 1 ? 's' : ''}
          </div>
          <div className="text-muted">{total} funcionário{total !== 1 ? 's' : ''} no total</div>
        </div>
      </div>
    </div>
  )
}

export interface PieSlice {
  label: string
  value: number
}

export function PieChart({ title, slices, total }: { title: string; slices: PieSlice[]; total: number }) {
  let acc = 0
  const stops = slices.map((s, i) => {
    const pct = total > 0 ? (s.value / total) * 100 : 0
    const from = acc
    acc += pct
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${from}% ${acc}%`
  })
  const gradient = `conic-gradient(${stops.join(', ')})`

  return (
    <div className="border border-border rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-4">{title}</p>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="w-24 h-24 rounded-full shrink-0" style={{ background: gradient }} />
        <div className="text-xs space-y-1 flex-1 min-w-[140px]">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {s.label}
              </span>
              <span className="text-muted shrink-0">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            </div>
          ))}
          <div className="pt-1 mt-1 border-t border-border text-muted">Total: R$ {fm(total)}</div>
        </div>
      </div>
    </div>
  )
}

export interface StackedMonth {
  label: string
  salario: number
  vt: number
  current?: boolean
}

export function StackedBarChart({ title, months }: { title: string; months: StackedMonth[] }) {
  const max = Math.max(...months.map((m) => m.salario + m.vt), 1)
  return (
    <div className="border border-border rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-4">{title}</p>
      <div className="flex items-end gap-2 h-32 mb-2 overflow-x-auto">
        {months.map((m, i) => {
          const salH = Math.max(Math.round((m.salario / max) * 100), m.salario > 0 ? 3 : 0)
          const vtH = Math.max(Math.round((m.vt / max) * 100), m.vt > 0 ? 2 : 0)
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 w-11 shrink-0" style={{ opacity: m.current ? 1 : 0.55 }}>
              <div className="w-full flex flex-col-reverse">
                <div className="w-full bg-accent rounded-b" style={{ height: `${salH}px` }} />
                <div className="w-full bg-blue rounded-t" style={{ height: `${vtH}px` }} />
              </div>
              <span className="text-[10px] text-muted truncate w-full text-center">{m.label}</span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-accent" /> Salário
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue" /> VT
        </span>
      </div>
    </div>
  )
}
