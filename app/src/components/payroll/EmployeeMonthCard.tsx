import { useState } from 'react'
import { monthDateRange, paidAmountOf, paymentStatus, remainingBalance, type PayrollCalc } from '../../lib/payroll/calc'
import { fd, fm, tod } from '../../lib/payroll/format'
import { MP } from '../../lib/payroll/constants'
import type { WorkEvent } from '../../types/event'
import type { Adjustment, AdjustmentType } from '../../types/adjustment'
import { ADJUSTMENT_LABELS, DEDUCTION_TYPES } from '../../types/adjustment'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import type { Payment } from '../../types/payment'
import { EventModal } from './EventModal'
import { AdjustmentModal } from './AdjustmentModal'
import { PaymentModal } from './PaymentModal'
import { PaymentReceipt } from './PaymentReceipt'
import { PayEventModal } from './PayEventModal'

interface Props {
  c: PayrollCalc
  canWrite: boolean
  regionalHolidays: RegionalHoliday[]
  onSaveEvent: (ev: WorkEvent) => Promise<void>
  onDeleteEvent: (sbid: string) => Promise<void>
  onSaveAdjustment: (adj: Adjustment) => Promise<void>
  onDeleteAdjustment: (sbid: string) => Promise<void>
  onSetVtOverride: (days: number | null) => Promise<void>
  onSetProRata: (active: boolean) => Promise<void>
  onConfirmPayment: (payment: Payment) => Promise<void>
  onCancelPayment: () => Promise<void>
}

type EncargoField = 'fgts' | 'fgtsIndenizatorio' | 'inssPatronal' | 'sat' | 'prov13' | 'provFerias' | 'irrf'

export function EmployeeMonthCard({
  c, canWrite, regionalHolidays, onSaveEvent, onDeleteEvent, onSaveAdjustment, onDeleteAdjustment,
  onSetVtOverride, onSetProRata, onConfirmPayment, onCancelPayment,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [eventModal, setEventModal] = useState<{ ev: WorkEvent | null; date: string } | null>(null)
  const [adjModal, setAdjModal] = useState<{
    adj: Adjustment | null
    defaultType?: AdjustmentType
    defaultValue?: number
    defaultDesc?: string
    defaultDate?: string
  } | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [payEventModal, setPayEventModal] = useState<WorkEvent | null>(null)
  const [vtInput, setVtInput] = useState<string>(c.vtManualDays !== null ? String(c.vtManualDays) : '')

  const recGroups = groupRecurring(c.recs)
  const status = paymentStatus(c)
  const { min: minDate, max: maxDate } = monthDateRange(c.ry, c.rm)
  const clampToMonth = (iso: string) => (iso < minDate ? minDate : iso > maxDate ? maxDate : iso)

  function openEncargoAdjust(field: EncargoField, val: number) {
    setAdjModal({
      adj: null,
      defaultType: field,
      defaultValue: val,
      defaultDesc: `${ADJUSTMENT_LABELS[field]} — ${MP[c.rm]} ${c.ry}`,
      defaultDate: clampToMonth(tod()),
    })
  }

  function handleFalta() {
    setAdjModal({
      adj: null,
      defaultType: 'falta',
      defaultValue: c.dailyRate,
      defaultDesc: 'Falta não justificada',
      defaultDate: clampToMonth(tod()),
    })
  }

  async function handleConfirmPayEvent(paidDate: string, method: string, notes: string) {
    const ev = payEventModal!
    await onSaveEvent({ ...ev, paidDate, paidMethod: method, paidNotes: notes })
    const existing = c.adjs.find((a) => a.id === 'ant_' + ev.id)
    await onSaveAdjustment({
      id: 'ant_' + ev.id,
      evId: ev.id,
      type: 'antecipacao',
      value: ev.value,
      date: paidDate,
      desc: `Diária ${fd(ev.date)}${method ? ' · ' + method : ''}`,
      _sbid: existing?._sbid,
    })
    setPayEventModal(null)
  }

  async function handleUnpayEvent(ev: WorkEvent) {
    if (!confirm('Desfazer o pagamento desta diária?')) return
    await onSaveEvent({ ...ev, paidDate: undefined, paidMethod: undefined, paidNotes: undefined })
    const existing = c.adjs.find((a) => a.id === 'ant_' + ev.id)
    if (existing?._sbid) await onDeleteAdjustment(existing._sbid)
  }

  async function handleCancelPayment() {
    const msg =
      status === 'parcial'
        ? `Cancelar este pagamento parcial? O valor já registrado como pago (R$ ${fm(paidAmountOf(c.payment!))}) some do histórico e o mês volta para "não pago".`
        : 'Cancelar este pagamento? O mês volta para "não pago" e o recibo deixa de existir.'
    if (!confirm(msg)) return
    await onCancelPayment()
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="font-medium text-sm">{c.emp.name}</div>
          <div className="text-xs text-muted mt-0.5">
            {c.role}
            {status === 'pago' && <span className="ml-2 text-sage">✓ Pago em {fd(c.payment!.paidDate)}</span>}
            {status === 'parcial' && (
              <span className="ml-2 text-warn">◐ Parcial — falta R$ {fm(remainingBalance(c.payment!))}</span>
            )}
            {status === 'nada_a_pagar' && <span className="ml-2 text-muted">— Nada a pagar</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-accent">R$ {fm(c.total)}</div>
          <div className="text-[10px] text-muted">{expanded ? '▲' : '▼'}</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {c.holWarns.length > 0 && (
            <div className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2 space-y-1">
              <p className="font-medium">⚠️ {c.holWarns.length} dia(s) recorrente(s) em feriado sem diária lançada</p>
              {c.holWarns.map((w) => (
                <div key={w.iso} className="flex items-center justify-between">
                  <span>{fd(w.iso)} — {w.hn} ({w.desc})</span>
                  {canWrite && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setEventModal({ ev: null, date: w.iso })}
                    >
                      Lançar diária →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {(c.feriasDiasNoMes > 0 || c.licencaMedicaDiasNoMes > 0 || c.licencaMaternidadeDiasNoMes > 0) && (
            <div className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 space-y-0.5">
              {c.feriasDiasNoMes > 0 && <p>🏖️ {c.feriasDiasNoMes} dia(s) de férias este mês</p>}
              {c.licencaMedicaDiasNoMes > 0 && <p>🏥 {c.licencaMedicaDiasNoMes} dia(s) de licença médica este mês</p>}
              {c.licencaMaternidadeDiasNoMes > 0 && (
                <p>🤱 {c.licencaMaternidadeDiasNoMes} dia(s) de licença maternidade este mês</p>
              )}
            </div>
          )}

          {c.isFirstMonth ? (
            <div className={`rounded-lg border p-3 ${c.proRataActive ? 'border-warn/40 bg-warn/5' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">Salário — Pro Rata</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-warn/15 text-warn">1º mês</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-cream rounded-lg p-2">
                  <div className="text-[10px] text-muted">Integral</div>
                  <div className="font-medium">R$ {fm(c.netSal)}</div>
                </div>
                <div className={`rounded-lg p-2 ${c.proRataActive ? 'bg-warn/10' : 'bg-cream'}`}>
                  <div className="text-[10px] text-muted">Pro Rata ({c.proRataDias}/30)</div>
                  <div className="font-medium text-warn">R$ {fm(c.proRataSal)}</div>
                </div>
              </div>
              {canWrite && !c.payment && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSetProRata(false)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border ${!c.proRataActive ? 'bg-accent text-white border-accent' : 'border-border'}`}
                  >
                    Usar integral
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetProRata(true)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border ${c.proRataActive ? 'bg-accent text-white border-accent' : 'border-border'}`}
                  >
                    Usar pro rata
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Row label="Salário base" value={c.salBase} />
          )}

          {recGroups.length > 0 && (
            <Section title="Diárias recorrentes" total={c.recTot}>
              {recGroups.map((g, i) => (
                <div key={i} className="flex justify-between text-xs py-1">
                  <span>{g.desc}</span>
                  <span className="text-muted">
                    {g.count}× R$ {fm(g.value)} = R$ {fm(g.value * g.count)}
                  </span>
                </div>
              ))}
            </Section>
          )}

          <Section
            title="Diárias avulsas"
            total={c.avTot}
            action={
              canWrite && (
                <button type="button" className="text-xs text-accent underline" onClick={() => setEventModal({ ev: null, date: clampToMonth(tod()) })}>
                  + Nova
                </button>
              )
            }
          >
            {c.avs.length === 0 && <p className="text-xs text-muted">Nenhuma diária avulsa lançada.</p>}
            {c.avs.map((ev) => {
              const isPaid = !!ev.paidDate
              return (
                <div key={ev.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <button type="button" className="text-left underline decoration-dotted min-w-0" onClick={() => canWrite && setEventModal({ ev, date: ev.date })}>
                    {fd(ev.date)} — {ev.duration}
                    {ev.hn && ' 🎉'}
                    {isPaid && <span className="ml-1.5 text-[10px] text-sage">✓ Pago {fd(ev.paidDate!)}</span>}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={isPaid ? 'text-sage' : 'text-blue'}>R$ {fm(ev.value)}</span>
                    {canWrite && !isPaid && (
                      <button
                        type="button"
                        onClick={() => setPayEventModal(ev)}
                        className="px-2 py-0.5 rounded-md bg-sage text-white text-[10px] whitespace-nowrap"
                      >
                        $ Pagar
                      </button>
                    )}
                    {canWrite && isPaid && (
                      <button
                        type="button"
                        onClick={() => handleUnpayEvent(ev)}
                        className="px-2 py-0.5 rounded-md border border-border text-muted text-[10px] whitespace-nowrap"
                      >
                        ✕ Pgto
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </Section>

          <Section
            title="Ajustes"
            total={c.bons - c.deds}
            action={
              canWrite && (
                <>
                  {c.dailyRate > 0 && (
                    <button
                      type="button"
                      className="text-xs text-danger underline"
                      onClick={handleFalta}
                      title={`Diária calculada pela jornada: R$ ${fm(c.dailyRate)}`}
                    >
                      − Falta
                    </button>
                  )}
                  <button type="button" className="text-xs text-accent underline" onClick={() => setAdjModal({ adj: null, defaultDate: clampToMonth(tod()) })}>
                    + Novo
                  </button>
                </>
              )
            }
          >
            {c.adjs.length === 0 && <p className="text-xs text-muted">Nenhum ajuste lançado.</p>}
            {c.adjs.map((a) => {
              const isDed = DEDUCTION_TYPES.includes(a.type)
              return (
                <div key={a.id} className="flex items-center justify-between text-xs py-1">
                  <button type="button" className="text-left underline decoration-dotted" onClick={() => canWrite && setAdjModal({ adj: a })}>
                    {ADJUSTMENT_LABELS[a.type]}
                    {a.desc && ` · ${a.desc}`}
                  </button>
                  <span className={isDed ? 'text-danger' : 'text-sage'}>
                    {isDed ? '− ' : '+ '}R$ {fm(a.value)}
                  </span>
                </div>
              )
            })}
          </Section>

          {c.feriasAdicional > 0 && (
            <div className="flex justify-between text-sm">
              <span>Adicional de férias (1/3)</span>
              <span className="text-sage">+ R$ {fm(c.feriasAdicional)}</span>
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

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Vale Transporte</span>
              <span className="text-xs">R$ {fm(c.vtNet)}</span>
            </div>
            <div className="text-[11px] text-muted mb-2">
              {c.vtWd} dia(s) × R$ {fm(c.vtDaily)} = R$ {fm(c.vtGross)} − desconto R$ {fm(c.vtDisc)}
            </div>
            {canWrite && (
              <div className="flex gap-2 items-center">
                <input
                  className="input flex-1"
                  type="number"
                  placeholder={`Automático (${c.vtWdAuto})`}
                  value={vtInput}
                  onChange={(e) => setVtInput(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-border text-xs whitespace-nowrap"
                  onClick={() => onSetVtOverride(vtInput.trim() === '' ? null : +vtInput)}
                >
                  Ajustar dias
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-cream p-3 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted mb-1">Encargos patronais e provisões</p>
            <EncargoRow label="FGTS (8%)" value={c.fgts} onAdjust={canWrite ? () => openEncargoAdjust('fgts', c.fgts) : undefined} />
            <EncargoRow label="FGTS Indenizatório (3,2%)" value={c.fgtsIndenizatorio} onAdjust={canWrite ? () => openEncargoAdjust('fgtsIndenizatorio', c.fgtsIndenizatorio) : undefined} />
            <EncargoRow label="INSS Patronal (8%)" value={c.inssPatronal} onAdjust={canWrite ? () => openEncargoAdjust('inssPatronal', c.inssPatronal) : undefined} />
            <EncargoRow label="Seguro Acidente Trabalho (0,8%)" value={c.sat} onAdjust={canWrite ? () => openEncargoAdjust('sat', c.sat) : undefined} />
            <EncargoRow label="Provisão 13º" value={c.prov13} onAdjust={canWrite ? () => openEncargoAdjust('prov13', c.prov13) : undefined} />
            <EncargoRow label="Provisão Férias+1/3" value={c.provFerias} onAdjust={canWrite ? () => openEncargoAdjust('provFerias', c.provFerias) : undefined} />
            {c.irrf > 0 && <EncargoRow label="IRRF estimado" value={c.irrf} onAdjust={canWrite ? () => openEncargoAdjust('irrf', c.irrf) : undefined} />}
            <div className="flex justify-between text-xs font-medium pt-1 border-t border-border/60">
              <span>Custo total estimado</span>
              <span className="text-accent">R$ {fm(c.custoTotal)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="font-medium text-sm">Total a pagar</span>
            <span className="font-medium text-lg text-accent">R$ {fm(c.total)}</span>
          </div>

          {status === 'parcial' && (
            <div className="text-xs space-y-0.5 bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
              <div className="flex justify-between">
                <span className="text-muted">Pago</span>
                <span>R$ {fm(paidAmountOf(c.payment!))}</span>
              </div>
              <div className="flex justify-between font-medium text-warn">
                <span>Saldo restante</span>
                <span>R$ {fm(remainingBalance(c.payment!))}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {c.payment && (
              <button type="button" onClick={() => setShowReceipt(true)} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm">
                📄 Recibo
              </button>
            )}
            {canWrite && status !== 'nada_a_pagar' && (
              <button type="button" onClick={() => setShowPayment(true)} className="btn-primary flex-1">
                {status === 'parcial' ? 'Completar pagamento' : c.payment ? 'Editar pagamento' : 'Confirmar pagamento'}
              </button>
            )}
            {canWrite && c.payment && (
              <button
                type="button"
                onClick={handleCancelPayment}
                title="Cancelar pagamento"
                className="px-3 py-2.5 rounded-lg border border-danger/40 text-danger text-sm shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {eventModal && (
        <EventModal
          emp={c.emp}
          event={eventModal.ev}
          defaultDate={eventModal.date}
          minDate={minDate}
          maxDate={maxDate}
          regionalHolidays={regionalHolidays}
          onClose={() => setEventModal(null)}
          onSave={async (ev) => {
            await onSaveEvent(ev)
            setEventModal(null)
          }}
          onDelete={
            eventModal.ev?._sbid
              ? async () => {
                  await onDeleteEvent(eventModal.ev!._sbid!)
                  setEventModal(null)
                }
              : undefined
          }
        />
      )}

      {adjModal && (
        <AdjustmentModal
          emp={c.emp}
          adjustment={adjModal.adj}
          defaultType={adjModal.defaultType}
          defaultValue={adjModal.defaultValue}
          defaultDesc={adjModal.defaultDesc}
          defaultDate={adjModal.defaultDate}
          minDate={minDate}
          maxDate={maxDate}
          onClose={() => setAdjModal(null)}
          onSave={async (adj) => {
            await onSaveAdjustment(adj)
            setAdjModal(null)
          }}
          onDelete={
            adjModal.adj?._sbid
              ? async () => {
                  const adj = adjModal.adj!
                  await onDeleteAdjustment(adj._sbid!)
                  if (adj.type === 'antecipacao' && adj.evId) {
                    const ev = c.avs.find((e) => e.id === adj.evId)
                    if (ev) await onSaveEvent({ ...ev, paidDate: undefined, paidMethod: undefined, paidNotes: undefined })
                  }
                  setAdjModal(null)
                }
              : undefined
          }
        />
      )}

      {showPayment && (
        <PaymentModal
          c={c}
          onClose={() => setShowPayment(false)}
          onConfirm={async (payment) => {
            await onConfirmPayment(payment)
            setShowPayment(false)
          }}
        />
      )}

      {showReceipt && c.payment && (
        <PaymentReceipt payment={c.payment} onClose={() => setShowReceipt(false)} />
      )}

      {payEventModal && (
        <PayEventModal
          ev={payEventModal}
          minDate={minDate}
          maxDate={maxDate}
          onClose={() => setPayEventModal(null)}
          onConfirm={handleConfirmPayEvent}
        />
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

function Section({ title, total, action, children }: { title: string; total: number; action?: React.ReactNode; children: React.ReactNode }) {
  const negative = total < 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{title}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${negative ? 'text-danger' : 'text-sage'}`}>
            {negative ? '− ' : '+ '}R$ {fm(Math.abs(total))}
          </span>
          {action}
        </div>
      </div>
      {children}
    </div>
  )
}

function EncargoRow({ label, value, onAdjust }: { label: string; value: number; onAdjust?: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span>R$ {fm(value)}</span>
        {onAdjust && (
          <button type="button" onClick={onAdjust} className="text-[10px] px-2 py-0.5 rounded border border-border text-muted">
            + Ajuste
          </button>
        )}
      </div>
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
