import { z } from 'zod';

export const buscaSchema = z.object({
  /**
   * Dois caracteres no mínimo.
   *
   * Com um só, quase todo lançamento casa e o resultado é a lista inteira — o que parece
   * uma busca quebrada, e custa uma varredura completa da tabela a cada tecla digitada.
   */
  q: z.string().trim().min(2, 'Digite ao menos 2 caracteres'),
});

export const tipoDoResultadoSchema = z.enum(['LANCAMENTO', 'PESSOA', 'CARTAO', 'GRUPO']);

export const resultadoDaBuscaSchema = z.object({
  tipo: tipoDoResultadoSchema,
  id: z.string().uuid(),
  titulo: z.string(),
  /** A segunda linha: contraparte, vencimento, o que ajuda a reconhecer o item. */
  detalhe: z.string(),
  valor: z.string().nullable(),
  link: z.string(),
});

export const resultadosDaBuscaSchema = z.object({
  termo: z.string(),
  itens: z.array(resultadoDaBuscaSchema),
  /** Verdadeiro quando havia mais do que o teto por tipo e a lista foi cortada. */
  truncado: z.boolean(),
});

/**
 * Teto por tipo de resultado.
 *
 * Cortar por tipo, e não no total, evita que trezentos lançamentos empurrem para fora a
 * única pessoa que casava com o termo — que costuma ser exatamente o que se procurava.
 */
export const LIMITE_POR_TIPO = 10;

export type ResultadoDaBusca = z.infer<typeof resultadoDaBuscaSchema>;
export type ResultadosDaBusca = z.infer<typeof resultadosDaBuscaSchema>;
