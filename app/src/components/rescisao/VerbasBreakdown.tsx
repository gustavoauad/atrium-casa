import { fd, fm } from '../../lib/payroll/format'
import { PAYROLL_RULES_VERSION, RESCISAO_DISCLAIMER } from '../../lib/payroll/constants'
import type { VerbasResult } from '../../lib/payroll/rescisao'

export function VerbasBreakdown({ r }: { r: VerbasResult }) {
  return (
    <div className="space-y-3">
      <div
        role="alert"
        className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn font-medium"
      >
        ⚠️ {RESCISAO_DISCLAIMER}
      </div>

      <div className="rounded-lg border border-border p-3 space-y-1">
        {r.itens.map((it, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-muted">{it.l}</span>
            <span className={it.pos ? 'text-sage' : 'text-danger'}>
              {it.pos ? '+ ' : '− '}R$ {fm(it.v)}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-medium pt-2 border-t border-border mt-2">
          <span>Total líquido</span>
          <span className="text-accent">R$ {fm(r.total)}</span>
        </div>
      </div>

      <p className="text-[10px] text-muted">
        Competência: desligamento em {fd(r.desligamentoISO)} · {PAYROLL_RULES_VERSION}
      </p>
    </div>
  )
}
