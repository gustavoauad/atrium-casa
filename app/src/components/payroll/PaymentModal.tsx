import { useState } from 'react'
import { paidAmountOf, type PayrollCalc } from '../../lib/payroll/calc'
import { fm, r2, tod, uid } from '../../lib/payroll/format'
import type { Payment } from '../../types/payment'

const METHODS = ['PIX', 'Transferência', 'Dinheiro', 'Depósito', 'Quinzena (1ª parcela)', 'Quinzena (2ª parcela)']

interface Props {
  c: PayrollCalc
  onClose: () => void
  onConfirm: (payment: Payment) => Promise<void>
}

export function PaymentModal({ c, onClose, onConfirm }: Props) {
  const [paidDate, setPaidDate] = useState(c.payment?.paidDate || tod())
  const [method, setMethod] = useState(c.payment?.method || METHODS[0])
  const [notes, setNotes] = useState(c.payment?.notes || '')
  const [paidAmount, setPaidAmount] = useState(c.payment ? paidAmountOf(c.payment) : c.total)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const remaining = r2(c.total - paidAmount)
  const isPartial = paidAmount < c.total - 0.01

  async function handleConfirm() {
    setError('')
    if (paidAmount <= 0 || paidAmount > c.total + 0.01) {
      setError('O valor pago deve ser maior que zero e não pode passar do total a pagar.')
      return
    }
    setSaving(true)
    try {
      const payment: Payment = {
        id: c.payment?.id || uid(),
        empId: c.emp.id,
        empName: c.emp.name,
        empRole: c.role,
        monthKey: c.key,
        ry: c.ry,
        rm: c.rm,
        salBase: c.salBase,
        recTot: c.recTot,
        avTot: c.avTot,
        bons: c.bons,
        deds: c.deds,
        inssAmt: c.inssAmt,
        netSal: c.finalNetSal,
        proRataActive: c.proRataActive,
        vtNet: c.vtNet,
        vtGross: c.vtGross,
        vtDisc: c.vtDisc,
        vtWd: c.vtWd,
        vtWdAuto: c.vtWdAuto,
        vtY: c.vtY,
        vtM: c.vtM,
        total: c.total,
        paidAmount: r2(paidAmount),
        paidDate,
        method,
        isRescisao: false,
        rescTotal: null,
        notes: notes.trim(),
        events: c.avs,
        adjs: c.adjs,
        recs: c.recs,
        paidAt: new Date().toISOString(),
        _sbid: c.payment?._sbid,
      }
      await onConfirm(payment)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-medium">{c.payment ? 'Editar pagamento' : 'Confirmar pagamento'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3 text-left">
          <p className="text-sm">{c.emp.name}</p>
          <div className="bg-cream rounded-lg px-4 py-3 flex justify-between items-center">
            <span className="text-xs text-muted">Total a pagar</span>
            <span className="font-medium text-lg text-accent">R$ {fm(c.total)}</span>
          </div>

          <Field label="Valor pago (R$)">
            <div className="flex gap-2">
              <input
                className="input"
                type="number"
                step="0.01"
                value={paidAmount || ''}
                onChange={(e) => setPaidAmount(+e.target.value || 0)}
              />
              <button
                type="button"
                onClick={() => setPaidAmount(c.total)}
                className="px-3 py-2 rounded-lg border border-border text-xs shrink-0 whitespace-nowrap"
              >
                Pagar tudo
              </button>
            </div>
          </Field>
          {isPartial && (
            <p className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
              Pagamento parcial — vai sobrar um saldo de <strong>R$ {fm(remaining)}</strong> a pagar.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Data do pagamento">
              <input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
            <Field label="Método">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Observações">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">
            Fechar
          </button>
          <button type="button" disabled={saving} onClick={handleConfirm} className="btn-primary px-4">
            {saving ? 'Confirmando…' : isPartial ? 'Confirmar pagamento parcial' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">{label}</span>
      {children}
    </label>
  )
}
