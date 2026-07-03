import { lighten } from './color'

export interface HouseThemeColors {
  accent: string
}

/** Cor de destaque padrão da marca Atrium (a mesma do CSS quando a Casa não tem cor própria). */
export const DEFAULT_ACCENT = '#8B6F47'

/**
 * Sobrescreve as variáveis de cor de destaque no :root a partir da cor escolhida pela Casa.
 * A relação entre accent/accent-2 e o clareamento no modo escuro replica a proporção
 * usada nas cores padrão do app (ver src/index.css).
 */
export function applyHouseTheme(colors: HouseThemeColors | null, resolved: 'light' | 'dark') {
  const root = document.documentElement.style
  if (!colors) {
    root.removeProperty('--color-accent')
    root.removeProperty('--color-accent-2')
    return
  }
  const { accent } = colors
  if (resolved === 'dark') {
    root.setProperty('--color-accent', lighten(accent, 0.35))
    root.setProperty('--color-accent-2', lighten(accent, 0.55))
  } else {
    root.setProperty('--color-accent', accent)
    root.setProperty('--color-accent-2', lighten(accent, 0.25))
  }
}
