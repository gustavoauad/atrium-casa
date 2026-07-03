import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { AuthScreen } from './components/auth/AuthScreen'
import { HousePickerScreen } from './components/house/HousePickerScreen'
import { Logo } from './components/ui/Logo'
import { supabase } from './lib/supabase'
import type { House, HouseRole } from './types/house'
import { ROLE_LABELS, isAdminOrOwner } from './types/house'
import { loadHouseThemeColors } from './hooks/useSettings'
import { applyHouseTheme, type HouseThemeColors } from './lib/houseTheme'

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

type Tab = 'dashboard' | 'folha' | 'funcionarios' | 'relatorios' | 'rescisao' | 'templates' | 'feriados' | 'casa'

function AppShell() {
  const { user, loading } = useAuth()
  const { resolved, cycleTheme } = useTheme()
  const [house, setHouse] = useState<House | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [houseThemeColors, setHouseThemeColors] = useState<HouseThemeColors | null>(null)

  useEffect(() => {
    if (!user) setHouse(null)
  }, [user])

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

  function updateHouseRole(role: HouseRole) {
    setHouse((h) => (h ? { ...h, role } : h))
  }

  function backToHousePicker() {
    setHouse(null)
    setTab('dashboard')
  }

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between px-3 sm:px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-border gap-2">
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

      <nav className="flex gap-1 px-3 sm:px-4 pt-3 border-b border-border overflow-x-auto overflow-y-hidden">
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
        {managesHouse && (
          <TabButton active={tab === 'casa'} onClick={() => setTab('casa')}>
            Casa
          </TabButton>
        )}
      </nav>

      <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Carregando…</div>}>
        {tab === 'dashboard' && <DashboardScreen house={house} />}
        {tab === 'folha' && <PayrollScreen house={house} />}
        {tab === 'funcionarios' && <EmployeesScreen house={house} />}
        {tab === 'relatorios' && <ReportsScreen house={house} />}
        {tab === 'rescisao' && <RescisaoCalculatorScreen house={house} />}
        {tab === 'templates' && <DocumentTemplatesScreen house={house} />}
        {tab === 'feriados' && <RegionalHolidaysScreen house={house} />}
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
