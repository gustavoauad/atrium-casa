interface PrintableViewProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

/**
 * Visualização de impressão dentro do próprio app (em vez de window.open),
 * para evitar ficar "preso" sem navegação de volta em navegadores mobile/PWA
 * standalone, onde popups não têm barra de endereço/abas.
 */
export function PrintableView({ title, onClose, children }: PrintableViewProps) {
  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto print:static print:inset-auto print:z-auto print:h-auto print:overflow-visible">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-border bg-card">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs shrink-0">
          ← Voltar
        </button>
        <h2 className="text-sm font-medium truncate">{title}</h2>
        <button type="button" onClick={() => window.print()} className="btn-primary px-3 py-1.5 text-xs shrink-0 whitespace-nowrap">
          🖨 Imprimir / Salvar PDF
        </button>
      </div>
      <div className="max-w-3xl mx-auto p-6 text-text print:max-w-none print:p-0">{children}</div>
    </div>
  )
}
