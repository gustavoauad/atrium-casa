import { inssCalc } from './inss'
import { parseLocalDate } from './format'

export type MotivoRescisao = 'pedido' | 'semjusta' | 'comjusta' | 'acordo' | 'termino' | 'falecimento'
export type AvisoTipo = 'trabalhado' | 'indenizado' | 'dispensado'

export const MOTIVO_LABELS: Record<MotivoRescisao, string> = {
  pedido: 'Pedido de demissão',
  semjusta: 'Demissão sem justa causa',
  comjusta: 'Demissão por justa causa',
  acordo: 'Acordo mútuo (art. 484-A CLT)',
  termino: 'Término de contrato',
  falecimento: 'Falecimento',
}

export const AVISO_LABELS: Record<AvisoTipo, string> = {
  trabalhado: 'Trabalhado',
  indenizado: 'Indenizado pelo empregador',
  dispensado: 'Dispensado pelo empregado',
}

export interface VerbaItem {
  l: string
  v: number
  pos: boolean
}

export interface VerbasResult {
  motivo: MotivoRescisao
  anos: number
  meses: number
  diasR: number
  diasAviso: number
  avisoDesc: string
  itens: VerbaItem[]
  bruto: number
  descs: number
  total: number
  admissaoISO: string
  desligamentoISO: string
}

/** Cálculo de verbas rescisórias — porta fiel de calcVerbas() do app original. */
export function calcVerbas(
  salario: number,
  motivo: MotivoRescisao,
  admissaoISO: string,
  desligamentoISO: string,
  fgtsSaldo: number,
  avisoTipo: AvisoTipo,
): VerbasResult {
  const adm = parseLocalDate(admissaoISO)
  const desc = parseLocalDate(desligamentoISO)
  const diffDays = Math.floor((desc.getTime() - adm.getTime()) / 86400000)
  const anos = Math.floor(diffDays / 365)
  const meses = Math.floor((diffDays % 365) / 30)
  const diasR = diffDays % 30
  const salDia = salario / 30
  const diasTrab = desc.getDate()
  const saldoSal = salDia * diasTrab

  const anoDesc = desc.getFullYear()
  const mesAdmNoAno = adm.getFullYear() === anoDesc ? adm.getMonth() : 0
  const diasMesAdm =
    adm.getFullYear() === anoDesc ? new Date(anoDesc, adm.getMonth() + 1, 0).getDate() - adm.getDate() + 1 : 30
  const primeiroMes = diasMesAdm >= 15 ? mesAdmNoAno : mesAdmNoAno + 1
  const ultimoMes = desc.getDate() >= 15 ? desc.getMonth() : desc.getMonth() - 1
  const mesesAno = Math.max(0, Math.min(ultimoMes - primeiroMes + 1, 12))
  const dec13 = (salario / 12) * Math.min(mesesAno, 12)
  const mesesFerias = meses + (diasR >= 15 ? 1 : 0)
  const feriasProp = (salario / 12) * mesesFerias * (4 / 3)
  const feriasVenc = anos >= 1 ? salario * (4 / 3) : 0
  const diasAviso = Math.min(30 + anos * 3, 90)

  let avisoVal = 0
  let avisoDesc = ''
  if (motivo === 'semjusta') {
    if (avisoTipo === 'indenizado') {
      avisoVal = salDia * diasAviso
      avisoDesc = `Indenizado (${diasAviso} dias)`
    } else {
      avisoDesc = `Trabalhado (${diasAviso} dias)`
    }
  } else if (motivo === 'pedido') {
    avisoDesc = avisoTipo === 'dispensado' ? 'Dispensado pelo empregado' : `Trabalhado (${diasAviso} dias)`
  } else if (motivo === 'acordo') {
    avisoVal = salDia * (diasAviso / 2)
    avisoDesc = `Metade indenizado (${Math.ceil(diasAviso / 2)} dias)`
  }

  const multaFGTS = motivo === 'semjusta' ? fgtsSaldo * 0.4 : motivo === 'acordo' ? fgtsSaldo * 0.2 : 0

  const itens: VerbaItem[] = []
  itens.push({ l: `Saldo de salário (${diasTrab} dias)`, v: saldoSal, pos: true })
  if (motivo !== 'comjusta') {
    itens.push({ l: `13º proporcional (${mesesAno}/12)`, v: dec13, pos: true })
    itens.push({ l: `Férias proporcionais + 1/3 (${mesesFerias}/12)`, v: feriasProp, pos: true })
    if (feriasVenc > 0) itens.push({ l: 'Férias vencidas + 1/3', v: feriasVenc, pos: true })
    if (avisoVal > 0) itens.push({ l: `Aviso prévio indenizado — ${avisoDesc}`, v: avisoVal, pos: true })
    if (multaFGTS > 0) itens.push({ l: `Multa FGTS ${motivo === 'acordo' ? '20%' : '40%'}`, v: multaFGTS, pos: true })
    itens.push({
      l: 'INSS sobre verbas salariais',
      v: inssCalc(saldoSal + dec13 + feriasProp + feriasVenc + avisoVal),
      pos: false,
    })
  }

  const bruto = itens.filter((x) => x.pos).reduce((a, x) => a + x.v, 0)
  const descs = itens.filter((x) => !x.pos).reduce((a, x) => a + x.v, 0)

  return {
    motivo,
    anos,
    meses,
    diasR,
    diasAviso,
    avisoDesc,
    itens,
    bruto,
    descs,
    total: bruto - descs,
    admissaoISO,
    desligamentoISO,
  }
}
