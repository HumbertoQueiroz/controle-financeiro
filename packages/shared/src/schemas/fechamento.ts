import { z } from 'zod';
import { formaDePagamentoSchema, mesDeReferenciaSchema } from './cartao.js';
import { lancamentoSchema } from './lancamento.js';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** `2026-08` vira `Agosto/2026`. É como o mês aparece no papel do fechamento. */
export function mesPorExtenso(mes: string): string {
  const indice = Number(mes.slice(5, 7)) - 1;

  return `${MESES[indice] ?? mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

/**
 * Os textos padrão do fechamento vivem aqui, e não em cada lado.
 *
 * A tela pré-preenche a descrição do acerto e o servidor a usa quando o usuário não manda
 * nada. Duas cópias divergiriam na primeira correção de texto, e o histórico ficaria com
 * duas redações para a mesma coisa — justo no campo que a pessoa usa para achar o acerto
 * meses depois.
 */
export function descricaoDoAcerto(numero: number, mes: string): string {
  return `Acerto do fechamento nº ${numero} do mês ${mesPorExtenso(mes)}`;
}

export function observacaoDaQuitacao(numero: number, mes: string): string {
  return `Quitado no fechamento nº ${numero} - ${mesPorExtenso(mes)}`;
}

/**
 * A combinação de fechar com alguém todo mês.
 *
 * Não dispara nada sozinho: marca a partir de que dia o acerto daquele mês passa a ser
 * cobrado na tela. Fechar por conta própria quitaria títulos sem ninguém conferir, e a
 * conferência é a razão de o fechamento existir.
 */
export const agendaDeFechamentoSchema = z.object({
  ativa: z.boolean(),
  diaDoMes: z.number().int().min(1).max(31),
  /** Último mês já fechado por esta agenda. Nulo quando nunca fechou. */
  ultimoMes: z.string().nullable(),
  /** O mês que está esperando fechamento agora, se houver. */
  mesPendente: z.string().nullable(),
});

export const definirAgendaSchema = z.object({
  ativa: z.boolean(),
  diaDoMes: z.coerce.number().int().min(1).max(31).default(1),
});

export const fechamentoDoParticipanteSchema = z.object({
  participante: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    /** Verdadeiro quando o participante também tem conta e enxerga o outro lado disto. */
    temConta: z.boolean(),
  }),
  mes: z.string(),
  /** O número que **este** fechamento receberá, se for confirmado agora. */
  proximoNumero: z.number().int(),
  /** O que o participante deve a você. */
  aReceber: z.array(lancamentoSchema),
  /** O que você deve ao participante. */
  aPagar: z.array(lancamentoSchema),
  totalAReceber: z.string(),
  totalAPagar: z.string(),
  /** A receber − a pagar. Positivo: tem a receber. Negativo: tem a pagar. */
  saldo: z.string(),
  /** A combinação de repetir este fechamento todo mês, quando existe. */
  agenda: agendaDeFechamentoSchema.nullable(),
});

/** O título de acerto da diferença. Ausente quando o saldo fecha em zero. */
export const novoTituloDoAcertoSchema = z.object({
  descricao: z.string().trim().min(2, 'Descreva o acerto'),
  vencimento: z.coerce.date(),
  formaDePagamento: formaDePagamentoSchema,
});

export const quitarFechamentoSchema = z.object({
  mes: mesDeReferenciaSchema,
  /**
   * Só os títulos marcados. O que ficou de fora continua em aberto para o próximo acerto —
   * é o que permite fechar o mês deixando de lado uma conta ainda em discussão.
   */
  lancamentosIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um lançamento'),
  /** A data da baixa dos títulos quitados. */
  dataDaQuitacao: z.coerce.date(),
  novoTitulo: novoTituloDoAcertoSchema.optional(),
});

export const resultadoDoFechamentoSchema = z.object({
  numero: z.number().int(),
  quitados: z.number().int(),
  /** Presente quando a diferença virou um título novo. */
  acertoId: z.string().uuid().nullable(),
});

// ---------------------------------------------------------------------------
// Histórico e agenda
// ---------------------------------------------------------------------------

export const fechamentoDoHistoricoSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  mes: z.string(),
  participanteId: z.string().uuid(),
  participante: z.string(),
  totalAReceber: z.string(),
  totalAPagar: z.string(),
  saldo: z.string(),
  fechadoEm: z.date(),
  /** Os títulos como estavam no dia, e não como estão agora. */
  itens: z.array(
    z.object({
      descricao: z.string(),
      valor: z.string(),
      aReceber: z.boolean(),
    }),
  ),
  acertoId: z.string().uuid().nullable(),
});

/**
 * O saldo em aberto com cada participante.
 *
 * `saldo` positivo é a receber; negativo, a pagar. Um número só, com sinal, em vez de dois
 * campos e uma flag: quem olha a lista quer saber de que lado está, e somar dois campos de
 * cabeça a cada linha é o que a tela existe para evitar.
 */
export const saldoComParticipanteSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  temConta: z.boolean(),
  aReceber: z.string(),
  aPagar: z.string(),
  saldo: z.string(),
  /** Quantos títulos em aberto formam esse saldo. */
  titulos: z.number(),
});

export const saldosDosParticipantesSchema = z.object({
  mes: z.string(),
  participantes: z.array(saldoComParticipanteSchema),
});

export type SaldoComParticipante = z.infer<typeof saldoComParticipanteSchema>;
export type SaldosDosParticipantes = z.infer<typeof saldosDosParticipantesSchema>;

export type FechamentoDoHistorico = z.infer<typeof fechamentoDoHistoricoSchema>;
export type AgendaDeFechamento = z.infer<typeof agendaDeFechamentoSchema>;
export type DefinirAgenda = z.infer<typeof definirAgendaSchema>;
export type FechamentoDoParticipante = z.infer<typeof fechamentoDoParticipanteSchema>;
export type NovoTituloDoAcerto = z.infer<typeof novoTituloDoAcertoSchema>;
export type QuitarFechamento = z.infer<typeof quitarFechamentoSchema>;
export type ResultadoDoFechamento = z.infer<typeof resultadoDoFechamentoSchema>;
