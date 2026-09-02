import { fd, fm } from '../../lib/payroll/format'
import { ADJUSTMENT_LABELS, DEDUCTION_TYPES } from '../../types/adjustment'
import { paidAmountOf, paymentStatus, remainingBalance, type PayrollCalc } from '../../lib/payroll/calc'

/** Detalhamento completo (somente leitura) de um funcionário/mês — mesmo nível de detalhe da Folha de Pagamento. */
export function PayrollDetailCard({ c }: { c: PayrollCalc }) {
  const recGroups = groupRecurring(c.recs)
  const status = paymentStatus(c)

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
            {status === 'pago' && <span className="text-sage">✓ Pago em {fd(c.payment!.paidDate)}</span>}
            {status === 'parcial' && <span className="text-warn">◐ Parcial — falta R$ {fm(remainingBalance(c.payment!))}</span>}
            {status === 'nada_a_pagar' && <span className="text-muted">— Nada a pagar</span>}
            {status === 'pendente' && <span className="text-warn">○ Pendente</span>}
          </div>
        </div>
      </div>

      {c.isFirstMonth && (
        <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-lg px-2 py-1.5">
          1º mês — Pro Rata {c.proRataActive ? 'ativo' : 'não usado (integral)'} ({c.proRataDias}/30 dias)
        </div>
      )}

      {c.midMonthChange && (
        <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-lg px-2 py-1.5">
          Contrato mudou em {fd(c.midMonthChange.date)} — salário-base prorrateado: {c.midMonthChange.oldDays} dia(s) a R${' '}
          {fm(c.midMonthChange.prevSalary)}/mês + {c.midMonthChange.newDays} dia(s) a R$ {fm(c.midMonthChange.newSalary)}/mês
        </div>
      )}

      {(c.feriasDiasNoMes > 0 || c.licencaMedicaDiasNoMes > 0 || c.licencaMaternidadeDiasNoMes > 0 || c.feriasDiasVendidos > 0) && (
        <div className="text-[11px] text-accent bg-accent/10 border border-accent/30 rounded-lg px-2 py-1.5 space-y-0.5">
          {c.feriasDiasNoMes > 0 && <p>🏖️ {c.feriasDiasNoMes} dia(s) de férias</p>}
          {c.feriasDiasVendidos > 0 && <p>💰 {c.feriasDiasVendidos} dia(s) de férias vendido(s) (abono)</p>}
          {c.licencaMedicaDiasNoMes > 0 && <p>🏥 {c.licencaMedicaDiasNoMes} dia(s) de licença médica</p>}
          {c.licencaMaternidadeDiasNoMes > 0 && <p>🤱 {c.licencaMaternidadeDiasNoMes} dia(s) de licença maternidade</p>}
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
              {ev.paidDate && <span className="ml-1.5 text-[10px] text-sage">✓ Pago {fd(ev.paidDate)}</span>}
            </span>
            <span className={ev.paidDate ? 'text-sage' : ''}>R$ {fm(ev.value)}</span>
          </div>
        ))}
        {c.avPaid > 0 && (
          <p className="text-[10px] text-muted mt-0.5">
            R$ {fm(c.avPaid)} já pago via antecipação (descontado do total abaixo).
          </p>
        )}
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

      {c.feriasAdicional > 0 && (
        <div className="flex justify-between text-sm">
          <span>Adicional de férias (1/3)</span>
          <span className="text-sage">+ R$ {fm(c.feriasAdicional)}</span>
        </div>
      )}
      {c.feriasAbono > 0 && (
        <div className="flex justify-between text-sm">
          <span>Abono de férias ({c.feriasDiasVendidos} dia(s) vendido(s) + 1/3)</span>
          <span className="text-sage">+ R$ {fm(c.feriasAbono)}</span>
        </div>
      )}
      {c.licencaMedicaDeducao > 0 && (
        <div className="flex justify-between text-sm">
          <span>Desconto licença médica</span>
          <span className="text-danger">− R$ {fm(c.licencaMedicaDeducao)}</span>
        </div>
      )}
      {c.licencaMaternidadeDeducao > 0 && (
        <div className="flex justify-between text-sm">
          <span>Desconto licença maternidade</span>
          <span className="text-danger">− R$ {fm(c.licencaMaternidadeDeducao)}</span>
        </div>
      )}

      <Row label="INSS empregado" value={-c.inssAmt} negative />

      <div className="text-xs text-muted">
        Vale-Transporte: {c.vtWd} dia(s) × R$ {fm(c.vtDaily)} = R$ {fm(c.vtGross)} − desconto R$ {fm(c.vtDisc)} ={' '}
        <strong className="text-blue">R$ {fm(c.vtNet)}</strong>
      </div>

      <div className="bg-cream rounded-lg p-2.5 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Encargos patronais e provisões</p>
        <EncRow label="FGTS (8%)" value={c.fgts} />
        <EncRow label="FGTS Indenizatório (3,2%)" value={c.fgtsIndenizatorio} />
        <EncRow label="INSS Patronal (8%)" value={c.inssPatronal} />
        <EncRow label="Seguro Acidente Trabalho (0,8%)" value={c.sat} />
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
          {status === 'parcial' && ` · Pago: R$ ${fm(paidAmountOf(c.payment))} · Saldo: R$ ${fm(remainingBalance(c.payment))}`}
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
  const negative = total < 0
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-wider text-muted font-medium">{title}</span>
        <span className={`text-xs ${negative ? 'text-danger' : 'text-sage'}`}>
          {negative ? '− ' : '+ '}R$ {fm(Math.abs(total))}
        </span>
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
