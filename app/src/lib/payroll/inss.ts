import { r2 } from './format'

/** Tabela progressiva INSS empregado doméstico (2024). Faixas: [limite, alíquota]. */
const INSS_BRACKETS: [number, number][] = [
  [1412, 0.075],
  [2666.68, 0.09],
  [4000.03, 0.12],
  [7786.02, 0.14],
]

// Teto de desconto do INSS (2024), recalculado a partir das faixas acima — confirme
// anualmente contra a Portaria Interministerial vigente (reajuste em janeiro).
const INSS_CAP = 908.85

export function inssCalc(v: number): number {
  let r = 0
  let p = 0
  for (const [lim, alq] of INSS_BRACKETS) {
    if (v <= lim) {
      r += (v - p) * alq
      break
    }
    r += (lim - p) * alq
    p = lim
  }
  return Math.min(r, INSS_CAP)
}

/** IRRF doméstico — tabela progressiva 2024. Base = salário bruto - INSS. */
export function irrfCalc(base: number): number {
  if (base > 4664.68) return r2(base * 0.275 - 896.0)
  if (base > 3751.06) return r2(base * 0.225 - 662.77)
  if (base > 2826.65) return r2(base * 0.15 - 381.44)
  if (base > 2259.2) return r2(base * 0.075 - 169.44)
  return 0
}
