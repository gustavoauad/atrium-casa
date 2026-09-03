export const MP = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const DP = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/**
 * Identifica, em recibos e telas de cálculo, qual versão das regras/tabelas internas
 * gerou aquele número — para rastrear divergências se as tabelas legais (INSS/IRRF,
 * fórmulas de rescisão) forem atualizadas depois. Bump manual a cada revisão dessas
 * tabelas (ver TODO-LEGAL em inss.ts e rescisao.ts).
 */
export const PAYROLL_RULES_VERSION = 'regras internas v1 · tabelas INSS/IRRF 2024'

/** Aviso obrigatório em toda simulação de rescisão — não é um documento oficial/TRCT. */
export const RESCISAO_DISCLAIMER =
  'Simulação estimativa. Confirme as verbas e incidências no eSocial antes do pagamento.'

export const DF = [
  'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
  'Sexta-feira', 'Sábado', 'Domingo',
]
