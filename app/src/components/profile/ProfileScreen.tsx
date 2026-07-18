import type { House } from '../../types/house'
import { ROLE_LABELS } from '../../types/house'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

const THEME_OPTS: { v: Theme; l: string }[] = [
  { v: 'light', l: '☀ Claro' },
  { v: 'dark', l: '☾ Escuro' },
  { v: 'system', l: '⚙ Sistema' },
]

interface Props {
  house: House
}

export function ProfileScreen({ house }: Props) {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Conta</p>
        <p className="text-sm">{user?.email}</p>
        <p className="text-xs text-muted mt-1">
          Seu papel em <strong>{house.name}</strong>: {ROLE_LABELS[house.role] || house.role}
        </p>
      </div>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">◐ Tema</p>
        <div className="flex gap-2">
          {THEME_OPTS.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setTheme(opt.v)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs ${
                theme === opt.v ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
