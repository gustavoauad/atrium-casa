import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerbasBreakdown } from '../VerbasBreakdown'
import { calcVerbas } from '../../../lib/payroll/rescisao'
import { RESCISAO_DISCLAIMER } from '../../../lib/payroll/constants'

describe('VerbasBreakdown — aviso legal obrigatório', () => {
  it('exibe o aviso de simulação estimativa (objetivo de Fase 1: nunca chamar de cálculo oficial/TRCT)', () => {
    const r = calcVerbas(3000, 'semjusta', '2025-01-01', '2026-08-15', 5000, 'indenizado')
    render(<VerbasBreakdown r={r} />)
    expect(screen.getByRole('alert')).toHaveTextContent(RESCISAO_DISCLAIMER)
  })

  it('exibe a data de competência (desligamento) e a versão das regras usadas', () => {
    const r = calcVerbas(3000, 'semjusta', '2025-01-01', '2026-08-15', 5000, 'indenizado')
    const { container } = render(<VerbasBreakdown r={r} />)
    expect(container.textContent).toMatch(/15\/08\/2026/)
    expect(container.textContent).toMatch(/regras internas v1/)
  })

  it('não usa a palavra "oficial" nem "TRCT" para descrever o resultado', () => {
    const r = calcVerbas(3000, 'semjusta', '2025-01-01', '2026-08-15', 5000, 'indenizado')
    const { container } = render(<VerbasBreakdown r={r} />)
    expect(container.textContent).not.toMatch(/oficial/i)
    expect(container.textContent).not.toMatch(/TRCT/)
  })
})
