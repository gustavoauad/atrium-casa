import { useEffect, useState } from 'react'
import type { House, HouseRole } from '../../types/house'
import type { Subscription } from '../../types/subscription'
import type { HouseThemeColors } from '../../lib/houseTheme'
import { ProfileScreen } from '../profile/ProfileScreen'
import { HouseSettingsScreen } from '../house-settings/HouseSettingsScreen'

type SubTab = 'perfil' | 'casa'

interface Props {
  house: House
  subscription: Subscription | null
  onSubscriptionRefresh: () => void
  managesHouse: boolean
  /** Incrementa toda vez que algo (ex: banner de assinatura) pede pra focar a sub-aba Casa. */
  casaFocusToken: number
  onRoleChanged: (role: HouseRole) => void
  onHouseDeleted: () => void
  onThemeChanged: (colors: HouseThemeColors | null) => void
}

export function ConfiguracoesScreen({
  house,
  subscription,
  onSubscriptionRefresh,
  managesHouse,
  casaFocusToken,
  onRoleChanged,
  onHouseDeleted,
  onThemeChanged,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('perfil')

  useEffect(() => {
    if (casaFocusToken > 0 && managesHouse) setSubTab('casa')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casaFocusToken])

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h2 className="text-lg font-medium mb-4">Configurações</h2>

      <div className="flex gap-1 mb-4 border-b border-border">
        <SubTabButton active={subTab === 'perfil'} onClick={() => setSubTab('perfil')}>
          Perfil
        </SubTabButton>
        <SubTabButton
          active={subTab === 'casa'}
          onClick={() => managesHouse && setSubTab('casa')}
          disabled={!managesHouse}
          title={!managesHouse ? 'Só o Proprietário ou Admin desta Casa podem acessar' : undefined}
        >
          {managesHouse ? 'Casa' : '🔒 Casa'}
        </SubTabButton>
      </div>

      {subTab === 'perfil' && <ProfileScreen house={house} />}
      {subTab === 'casa' && managesHouse && (
        <HouseSettingsScreen
          house={house}
          subscription={subscription}
          onSubscriptionRefresh={onSubscriptionRefresh}
          onRoleChanged={onRoleChanged}
          onHouseDeleted={onHouseDeleted}
          onThemeChanged={onThemeChanged}
        />
      )}
    </div>
  )
}

function SubTabButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${
        disabled
          ? 'border-transparent text-muted/40 cursor-not-allowed'
          : active
            ? 'border-accent text-accent font-medium'
            : 'border-transparent text-muted'
      }`}
    >
      {children}
    </button>
  )
}
