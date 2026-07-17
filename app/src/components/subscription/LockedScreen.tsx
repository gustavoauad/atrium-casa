interface Props {
  managesHouse: boolean
  isPastDue: boolean
  onGoToSubscription: () => void
}

export function LockedScreen({ managesHouse, isPastDue, onGoToSubscription }: Props) {
  return (
    <div className="w-full max-w-md mx-auto p-4 pt-16 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-lg font-medium mb-3">{isPastDue ? 'Pagamento pendente' : 'Seu período de teste acabou'}</h2>
      <p className="text-sm text-muted mb-1">Seus dados continuam salvos com segurança — nada foi perdido.</p>
      <p className="text-sm text-muted mb-6">
        Assine um plano pra continuar exatamente de onde parou, com todo o histórico intacto.
      </p>
      {managesHouse ? (
        <button type="button" onClick={onGoToSubscription} className="btn-primary px-6">
          Ver planos e assinar
        </button>
      ) : (
        <p className="text-xs text-muted bg-cream rounded-lg px-3 py-2">
          Peça ao Proprietário ou Admin desta Casa para regularizar a assinatura.
        </p>
      )}
    </div>
  )
}
