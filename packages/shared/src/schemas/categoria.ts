import { z } from 'zod';
import { direcaoSchema } from './lancamento.js';
import { mesDeReferenciaSchema } from './cartao.js';

const valorSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido')
  .refine((valor) => Number(valor) > 0, 'O valor precisa ser maior que zero');

/** Hex de seis dígitos. A tela oferece uma paleta, mas o campo aceita qualquer cor. */
const corSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida');

export const criarCategoriaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da categoria'),
  cor: corSchema.optional(),
  /** Ausente serve aos dois lados — "Transporte" pode ser gasto e reembolso. */
  direcao: direcaoSchema.optional(),
});

export const atualizarCategoriaSchema = criarCategoriaSchema
  .partial()
  .extend({ arquivada: z.boolean().optional() })
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const categoriaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  cor: z.string().nullable(),
  direcao: direcaoSchema.nullable(),
  arquivada: z.boolean(),
  /** O limite padrão da categoria, quando existe. Nulo é "sem limite". */
  limite: z.string().nullable(),
});

export const definirLimiteSchema = z.object({
  /**
   * Ausente define o limite **padrão**, que vale para todo mês sem ajuste próprio. Assim
   * o limite de mercado se define uma vez, e o mês do Natal ainda pode ter o seu.
   */
  mes: mesDeReferenciaSchema.optional(),
  /** Nulo remove o limite. */
  valor: valorSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Relatório por categoria
// ---------------------------------------------------------------------------

export const linhaDaCategoriaSchema = z.object({
  categoriaId: z.string().uuid().nullable(),
  nome: z.string(),
  cor: z.string().nullable(),
  /** Tudo que vence no mês nesta categoria. */
  previsto: z.string(),
  /** Só o que já teve baixa. */
  realizado: z.string(),
  /** O limite vigente no mês: o do mês, ou o padrão. Nulo é "sem limite". */
  limite: z.string().nullable(),
  /**
   * Quanto do limite foi consumido, de 0 a 1 e além. Nulo sem limite.
   *
   * Passa de 1 quando estourou, de propósito: cortar em 1 esconderia o tamanho do estouro,
   * que é justamente a informação que faz alguém mudar de comportamento.
   */
  consumo: z.number().nullable(),
});

export const relatorioPorCategoriaSchema = z.object({
  mes: z.string(),
  direcao: direcaoSchema,
  total: z.string(),
  linhas: z.array(linhaDaCategoriaSchema),
});

// ---------------------------------------------------------------------------
// Classificação em lote
// ---------------------------------------------------------------------------

/**
 * Um punhado de lançamentos que dizem a mesma coisa.
 *
 * Classificar um a um é o que faz ninguém classificar: doze corridas de Uber viram doze
 * decisões idênticas. Agrupar pela descrição transforma isso numa escolha só.
 */
export const grupoParaClassificarSchema = z.object({
  /** A descrição normalizada. Serve de chave estável para a tela. */
  chave: z.string(),
  /** A descrição como ela aparece, do lançamento mais recente do grupo. */
  descricao: z.string(),
  direcao: direcaoSchema,
  quantidade: z.number().int(),
  total: z.string(),
  /** Do mais antigo ao mais recente, para a tela dizer o período coberto. */
  primeiroVencimento: z.date(),
  ultimoVencimento: z.date(),
  lancamentosIds: z.array(z.string().uuid()),
  /**
   * A categoria que um lançamento igual já recebeu antes.
   *
   * É o que faz a tela ser rápida no segundo mês: quem classificou "UBER" uma vez não
   * deveria precisar decidir de novo.
   */
  sugestaoCategoriaId: z.string().uuid().nullable(),
  sugestaoCategoria: z.string().nullable(),
});

export const paraClassificarSchema = z.object({
  grupos: z.array(grupoParaClassificarSchema),
  /** Quantos lançamentos estão sem categoria no total, mesmo além dos grupos mostrados. */
  totalDeLancamentos: z.number().int(),
  /** Verdadeiro quando havia mais grupos do que o teto e a lista foi cortada. */
  truncado: z.boolean(),
});

export const classificarEmLoteSchema = z.object({
  lancamentosIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um lançamento'),
  /** Nulo remove a categoria dos lançamentos escolhidos. */
  categoriaId: z.string().uuid().nullable(),
});

export const resultadoDaClassificacaoSchema = z.object({
  classificados: z.number().int(),
});

/** Teto de grupos por consulta. Uma tela com 200 seletores não é uma tela, é um formulário. */
export const LIMITE_DE_GRUPOS = 50;

export type GrupoParaClassificar = z.infer<typeof grupoParaClassificarSchema>;
export type ParaClassificar = z.infer<typeof paraClassificarSchema>;
export type ClassificarEmLote = z.infer<typeof classificarEmLoteSchema>;
export type Categoria = z.infer<typeof categoriaSchema>;
export type CriarCategoria = z.infer<typeof criarCategoriaSchema>;
export type AtualizarCategoria = z.infer<typeof atualizarCategoriaSchema>;
export type DefinirLimite = z.infer<typeof definirLimiteSchema>;
export type LinhaDaCategoria = z.infer<typeof linhaDaCategoriaSchema>;
export type RelatorioPorCategoria = z.infer<typeof relatorioPorCategoriaSchema>;
