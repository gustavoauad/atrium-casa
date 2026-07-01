import { fd, fm } from '../../lib/payroll/format'
import { MP } from '../../lib/payroll/constants'
import type { Payment } from '../../types/payment'
import { PrintableView } from '../ui/PrintableView'

export function PaymentReceipt({ payment, vtDaily, onClose }: { payment: Payment; vtDaily: number; onClose: () => void }) {
  const p = payment
  const vtLabel = `${MP[p.vtM]} ${p.vtY}`

  return (
    <PrintableView title={`Recibo — ${p.empName}`} onClose={onClose}>
      <h1 className="text-3xl font-light mb-1">Recibo de Pagamento</h1>
      <p className="text-xs text-muted mb-6">
        {p.empName} · {p.empRole} · Competência: {MP[p.rm]} {p.ry}
      </p>

      <table className="w-full border-collapse mb-4">
        <tbody>
          <tr className="border-b border-border">
            <td className="py-2 text-sm">Salário base</td>
            <td className="py-2 text-right text-base">R$ {fm(p.salBase)}</td>
          </tr>
          {p.recTot > 0 && (
            <tr className="border-b border-border">
              <td className="py-2 text-sm">Diárias recorrentes</td>
              <td className="py-2 text-right text-base text-sage">+ R$ {fm(p.recTot)}</td>
            </tr>
          )}
          {p.avTot > 0 && (
            <tr className="border-b border-border">
              <td className="py-2 text-sm">Diárias avulsas</td>
              <td className="py-2 text-right text-base text-sage">+ R$ {fm(p.avTot)}</td>
            </tr>
          )}
          {p.bons > 0 && (
            <tr className="border-b border-border">
              <td className="py-2 text-sm">Bônus</td>
              <td className="py-2 text-right text-base text-sage">+ R$ {fm(p.bons)}</td>
            </tr>
          )}
          {p.deds > 0 && (
            <tr className="border-b border-border">
              <td className="py-2 text-sm">Descontos</td>
              <td className="py-2 text-right text-base text-danger">− R$ {fm(p.deds)}</td>
            </tr>
          )}
          {p.inssAmt > 0 && (
            <tr className="border-b border-border">
              <td className="py-2 text-sm">INSS</td>
              <td className="py-2 text-right text-base text-danger">− R$ {fm(p.inssAmt)}</td>
            </tr>
          )}
          <tr>
            <td className="pt-3.5 text-lg font-medium">Salário líquido</td>
            <td className="pt-3.5 text-right text-lg font-medium">R$ {fm(p.netSal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bg-cream rounded-lg px-4 py-3 text-xs text-muted mb-4">
        Vale-Transporte <strong>{vtLabel}</strong>: {p.vtWd} dias × R$ {fm(vtDaily)} = R$ {fm(p.vtGross)}
        {p.vtDisc > 0 ? ` − 6% (R$ ${fm(p.vtDisc)})` : ', sem desconto'} ={' '}
        <strong className="text-blue">R$ {fm(p.vtNet)}</strong>
      </div>

      <table className="w-full border-collapse mb-4">
        <tbody>
          <tr>
            <td className="pt-1 text-lg font-medium">Total do pagamento</td>
            <td className="pt-1 text-right text-lg font-medium">R$ {fm(p.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bg-cream rounded-lg px-4 py-3 text-xs text-muted mb-4">
        Pago em {fd(p.paidDate)} via {p.method}
        {p.notes ? ` · ${p.notes}` : ''}
      </div>

      <div className="border-t border-border pt-3 text-[11px] text-muted flex justify-between mb-6">
        <span>Atrium · Gestão Doméstica</span>
        <span>{new Date().toLocaleDateString('pt-BR')}</span>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <div className="border-t border-text pt-2 text-center text-[11px]">Empregador</div>
        <div className="border-t border-text pt-2 text-center text-[11px]">{p.empName}</div>
      </div>
    </PrintableView>
  )
}
