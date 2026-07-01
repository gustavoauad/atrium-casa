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
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs shrink-0">
          ← Voltar
        </button>
        <h2 className="text-sm font-medium truncate">{title}</h2>
        <button type="button" onClick={() => window.print()} className="btn-primary px-3 py-1.5 text-xs shrink-0 whitespace-nowrap">
          🖨 Imprimir / Salvar PDF
        </button>
      </div>
      <div className="max-w-3xl mx-auto p-6 text-text">{children}</div>
    </div>
  )
}
