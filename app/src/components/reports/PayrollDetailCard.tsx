import { fd, fm } from '../../lib/payroll/format'
import { ADJUSTMENT_LABELS, DEDUCTION_TYPES } from '../../types/adjustment'
import type { PayrollCalc } from '../../lib/payroll/calc'

/** Detalhamento completo (somente leitura) de um funcionário/mês — mesmo nível de detalhe da Folha de Pagamento. */
export function PayrollDetailCard({ c }: { c: PayrollCalc }) {
  const recGroups = groupRecurring(c.recs)

  return (
    <div className="border border-border rounded-xl bg-card p-4 space-y-3 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">{c.emp.name}</div>
          <div className="text-xs text-muted">{c.role}</div>
        </div>
        <div className="text-right">
          <div className="font-medium text-accent">R$ {fm(c.total)}</div>
          <div className="text-[10px]">
            {c.payment ? (
              <span className="text-sage">✓ Pago em {fd(c.payment.paidDate)}</span>
            ) : (
              <span className="text-warn">○ Pendente</span>
            )}
          </div>
        </div>
      </div>

      {c.isFirstMonth && (
        <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-lg px-2 py-1.5">
          1º mês — Pro Rata {c.proRataActive ? 'ativo' : 'não usado (integral)'} ({c.proRataDias}/30 dias)
        </div>
      )}

      <Row label={c.isFirstMonth ? 'Salário base (pro rata)' : 'Salário base'} value={c.isFirstMonth && c.proRataActive ? c.proRataSalBase : c.salBase} />

      {recGroups.length > 0 && (
        <DetailSection title="Diárias recorrentes" total={c.recTot}>
          {recGroups.map((g, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span>{g.desc}</span>
              <span className="text-muted">
                {g.count}× R$ {fm(g.value)} = R$ {fm(g.value * g.count)}
              </span>
            </div>
          ))}
        </DetailSection>
      )}

      <DetailSection title="Diárias avulsas" total={c.avTot}>
        {c.avs.length === 0 && <p className="text-xs text-muted">Nenhuma.</p>}
        {c.avs.map((ev) => (
          <div key={ev.id} className="flex justify-between text-xs py-0.5">
            <span>
              {fd(ev.date)} — {ev.duration}
              {ev.hn && ' 🎉'}
            </span>
            <span>R$ {fm(ev.value)}</span>
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Ajustes" total={c.bons - c.deds}>
        {c.adjs.length === 0 && <p className="text-xs text-muted">Nenhum.</p>}
        {c.adjs.map((a) => {
          const isDed = DEDUCTION_TYPES.includes(a.type)
          return (
            <div key={a.id} className="flex justify-between text-xs py-0.5">
              <span>
                {fd(a.date)} — {ADJUSTMENT_LABELS[a.type]}
                {a.desc && ` · ${a.desc}`}
              </span>
              <span className={isDed ? 'text-danger' : 'text-sage'}>
                {isDed ? '− ' : '+ '}R$ {fm(a.value)}
              </span>
            </div>
          )
        })}
      </DetailSection>

      <Row label="INSS empregado" value={-c.inssAmt} negative />

      <div className="text-xs text-muted">
        Vale-Transporte: {c.vtWd} dia(s) × R$ {fm(c.vtDaily)} = R$ {fm(c.vtGross)} − desconto R$ {fm(c.vtDisc)} ={' '}
        <strong className="text-blue">R$ {fm(c.vtNet)}</strong>
      </div>

      <div className="bg-cream rounded-lg p-2.5 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Encargos patronais e provisões</p>
        <EncRow label="FGTS (8%)" value={c.fgts} />
        <EncRow label="INSS Patronal (20%)" value={c.inssPatronal} />
        <EncRow label="Provisão 13º" value={c.prov13} />
        <EncRow label="Provisão Férias+1/3" value={c.provFerias} />
        {c.irrf > 0 && <EncRow label="IRRF estimado" value={c.irrf} />}
        <div className="flex justify-between text-xs font-medium pt-1 border-t border-border/60">
          <span>Custo total estimado</span>
          <span className="text-accent">R$ {fm(c.custoTotal)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-sm font-medium">Total a pagar</span>
        <span className="text-base font-medium text-accent">R$ {fm(c.total)}</span>
      </div>

      {c.payment && (
        <p className="text-[11px] text-muted">
          Pago via {c.payment.method}
          {c.payment.notes ? ` · ${c.payment.notes}` : ''}
        </p>
      )}
    </div>
  )
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className={negative ? 'text-danger' : ''}>R$ {fm(value)}</span>
    </div>
  )
}

function DetailSection({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-wider text-muted font-medium">{title}</span>
        <span className="text-xs text-sage">+ R$ {fm(total)}</span>
      </div>
      {children}
    </div>
  )
}

function EncRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted">{label}</span>
      <span>R$ {fm(value)}</span>
    </div>
  )
}

function groupRecurring(recs: PayrollCalc['recs']) {
  const groups: Record<string, { desc: string; value: number; count: number }> = {}
  for (const r of recs) {
    const k = `${r.desc}|${r.value}`
    if (!groups[k]) groups[k] = { desc: r.desc, value: r.value, count: 0 }
    groups[k].count++
  }
  return Object.values(groups)
}
