import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { AuthScreen } from './components/auth/AuthScreen'
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen'
import { HousePickerScreen } from './components/house/HousePickerScreen'
import { LockedScreen } from './components/subscription/LockedScreen'
import { Logo } from './components/ui/Logo'
import { supabase } from './lib/supabase'
import type { House, HouseRole } from './types/house'
import { ROLE_LABELS, isAdminOrOwner } from './types/house'
import { loadHouseThemeColors } from './hooks/useSettings'
import { applyHouseTheme, type HouseThemeColors } from './lib/houseTheme'
import { loadSubscription } from './hooks/useSubscription'
import type { Subscription } from './types/subscription'
import { canWriteForSubscription, employeeLimitForSubscription, trialDaysLeft } from './types/subscription'

const DashboardScreen = lazy(() => import('./components/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))
const EmployeesScreen = lazy(() => import('./components/employees/EmployeesScreen').then((m) => ({ default: m.EmployeesScreen })))
const PayrollScreen = lazy(() => import('./components/payroll/PayrollScreen').then((m) => ({ default: m.PayrollScreen })))
const RegionalHolidaysScreen = lazy(() =>
  import('./components/settings/RegionalHolidaysScreen').then((m) => ({ default: m.RegionalHolidaysScreen })),
)
const RescisaoCalculatorScreen = lazy(() =>
  import('./components/rescisao/RescisaoCalculatorScreen').then((m) => ({ default: m.RescisaoCalculatorScreen })),
)
const DocumentTemplatesScreen = lazy(() =>
  import('./components/documents/DocumentTemplatesScreen').then((m) => ({ default: m.DocumentTemplatesScreen })),
)
const ReportsScreen = lazy(() => import('./components/reports/ReportsScreen').then((m) => ({ default: m.ReportsScreen })))
const HouseSettingsScreen = lazy(() =>
  import('./components/house-settings/HouseSettingsScreen').then((m) => ({ default: m.HouseSettingsScreen })),
)
const ProfileScreen = lazy(() => import('./components/profile/ProfileScreen').then((m) => ({ default: m.ProfileScreen })))

type Tab =
  | 'dashboard'
  | 'folha'
  | 'funcionarios'
  | 'relatorios'
  | 'rescisao'
  | 'templates'
  | 'feriados'
  | 'casa'
  | 'perfil'

function AppShell() {
  const { user, loading, isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const { resolved, cycleTheme } = useTheme()
  const [house, setHouse] = useState<House | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [houseThemeColors, setHouseThemeColors] = useState<HouseThemeColors | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subRefreshKey, setSubRefreshKey] = useState(0)

  useEffect(() => {
    if (!user) setHouse(null)
  }, [user])

  useEffect(() => {
    if (!house) {
      setSubscription(null)
      return
    }
    let cancelled = false
    loadSubscription(house.id)
      .then((sub) => {
        if (!cancelled) setSubscription(sub)
      })
      .catch(() => {
        if (!cancelled) setSubscription(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id, subRefreshKey])

  useEffect(() => {
    if (!house) {
      setHouseThemeColors(null)
      return
    }
    let cancelled = false
    loadHouseThemeColors(house.id)
      .then((colors) => {
        if (!cancelled) setHouseThemeColors(colors)
      })
      .catch(() => {
        if (!cancelled) setHouseThemeColors(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id])

  useEffect(() => {
    applyHouseTheme(houseThemeColors, resolved)
  }, [houseThemeColors, resolved])

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <Logo size={36} />
      </div>
    )
  }

  if (isPasswordRecovery) return <ResetPasswordScreen onDone={clearPasswordRecovery} />

  if (!user) return <AuthScreen />

  if (!house) {
    return (
      <HousePickerScreen
        onSelect={(h) => {
          setHouse(h)
          setTab('dashboard')
        }}
      />
    )
  }

  const managesHouse = isAdminOrOwner(house.role)
  const canWriteHouse = canWriteForSubscription(subscription)
  const employeeLimit = employeeLimitForSubscription(subscription)
  const daysLeft = trialDaysLeft(subscription)
  const showLockedBanner = subscription !== null && !canWriteHouse
  const showTrialBanner = subscription?.tier === 'trial' && canWriteHouse && daysLeft !== null && daysLeft <= 5

  function refreshSubscription() {
    setSubRefreshKey((k) => k + 1)
  }

  function updateHouseRole(role: HouseRole) {
    setHouse((h) => (h ? { ...h, role } : h))
  }

  function backToHousePicker() {
    setHouse(null)
    setTab('dashboard')
  }

  return (
    <div className="min-h-svh">
      <header className="print:hidden flex items-center justify-between px-3 sm:px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-border gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="hidden sm:block">
            <Logo size={24} withText variant="topbar" />
          </div>
          <div className="sm:hidden">
            <Logo size={24} />
          </div>
          <div className="min-w-0 sm:border-l sm:border-border sm:pl-3">
            <h1 className="font-medium text-accent truncate text-sm sm:text-base">{house.name}</h1>
            <p className="text-[11px] sm:text-xs text-muted truncate">
              {user.email} — {ROLE_LABELS[house.role] || house.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={backToHousePicker}
            title="Trocar de Casa"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted shrink-0"
          >
            🏠
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            title="Alternar tema"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted shrink-0"
          >
            {resolved === 'dark' ? '☾' : '☀'}
          </button>
          <button type="button" onClick={() => supabase.auth.signOut()} className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-border text-xs shrink-0">
            Sair
          </button>
        </div>
      </header>

      <nav className="print:hidden flex gap-1 px-3 sm:px-4 pt-3 border-b border-border overflow-x-auto overflow-y-hidden">
        <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
          Visão Geral
        </TabButton>
        <TabButton active={tab === 'folha'} onClick={() => setTab('folha')}>
          Folha de Pagamento
        </TabButton>
        <TabButton active={tab === 'funcionarios'} onClick={() => setTab('funcionarios')}>
          Funcionários
        </TabButton>
        <TabButton active={tab === 'relatorios'} onClick={() => setTab('relatorios')}>
          Relatórios
        </TabButton>
        <TabButton active={tab === 'rescisao'} onClick={() => setTab('rescisao')}>
          Rescisão
        </TabButton>
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>
          Templates
        </TabButton>
        <TabButton active={tab === 'feriados'} onClick={() => setTab('feriados')}>
          Feriados Regionais
        </TabButton>
        <TabButton active={tab === 'perfil'} onClick={() => setTab('perfil')}>
          Perfil
        </TabButton>
        {managesHouse && (
          <TabButton active={tab === 'casa'} onClick={() => setTab('casa')}>
            Casa
          </TabButton>
        )}
      </nav>

      {showLockedBanner && (
        <div className="print:hidden bg-danger/10 border-b border-danger/30 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-danger flex items-center justify-between gap-2 flex-wrap">
          <span>
            🔒 A assinatura desta Casa está {subscription?.status === 'past_due' ? 'com pagamento pendente' : 'inativa'} —
            seus dados estão salvos e seguros, só ficam ocultos até a assinatura ser reativada.
            {!managesHouse && ' Peça ao Proprietário/Admin para regularizar.'}
          </span>
          <button
            type="button"
            onClick={() => setTab('perfil')}
            className="px-2.5 py-1 rounded-md border border-danger/40 text-danger text-[11px] shrink-0 whitespace-nowrap"
          >
            Ver assinatura
          </button>
        </div>
      )}

      {!showLockedBanner && showTrialBanner && (
        <div className="print:hidden bg-warn/10 border-b border-warn/30 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-warn flex items-center justify-between gap-2 flex-wrap">
          <span>
            ⏳ Seu teste grátis termina em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}.
            {!managesHouse && ' Avise o Proprietário/Admin pra assinar um plano.'}
          </span>
          <button
            type="button"
            onClick={() => setTab('perfil')}
            className="px-2.5 py-1 rounded-md border border-warn/40 text-warn text-[11px] shrink-0 whitespace-nowrap"
          >
            {managesHouse ? 'Assinar agora' : 'Ver detalhes'}
          </button>
        </div>
      )}

      <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Carregando…</div>}>
        {tab !== 'casa' && tab !== 'perfil' && showLockedBanner && (
          <LockedScreen
            managesHouse={managesHouse}
            isPastDue={subscription?.status === 'past_due'}
            onGoToSubscription={() => setTab('perfil')}
          />
        )}
        {tab === 'dashboard' && !showLockedBanner && <DashboardScreen house={house} />}
        {tab === 'folha' && !showLockedBanner && <PayrollScreen house={house} />}
        {tab === 'funcionarios' && !showLockedBanner && <EmployeesScreen house={house} employeeLimit={employeeLimit} />}
        {tab === 'relatorios' && !showLockedBanner && <ReportsScreen house={house} />}
        {tab === 'rescisao' && !showLockedBanner && <RescisaoCalculatorScreen house={house} />}
        {tab === 'templates' && !showLockedBanner && <DocumentTemplatesScreen house={house} />}
        {tab === 'feriados' && !showLockedBanner && <RegionalHolidaysScreen house={house} />}
        {tab === 'perfil' && (
          <ProfileScreen house={house} subscription={subscription} onSubscriptionRefresh={refreshSubscription} />
        )}
        {tab === 'casa' && managesHouse && (
          <HouseSettingsScreen
            house={house}
            onRoleChanged={updateHouseRole}
            onHouseDeleted={backToHousePicker}
            onThemeChanged={setHouseThemeColors}
          />
        )}
      </Suspense>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${active ? 'border-accent text-accent font-medium' : 'border-transparent text-muted'}`}
    >
      {children}
    </button>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
