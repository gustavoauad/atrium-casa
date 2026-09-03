import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Config de teste separada do vite.config.ts (que carrega o plugin do Tailwind,
 * desnecessário — e mais lento — para testes unitários puros).
 *
 * TZ fixado em America/Belem (UTC-3, sem horário de verão) para os testes de
 * cálculo de folha rodarem de forma determinística em qualquer máquina/CI,
 * independente do fuso do runner, e para exercitar deliberadamente um fuso
 * brasileiro diferente de UTC — ver src/lib/payroll/__tests__/dates.timezone.test.ts.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      TZ: 'America/Belem',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/payroll/**'],
    },
  },
})
