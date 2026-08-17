import { z } from 'zod';

/**
 * Os avisos são **derivados**, não guardados.
 *
 * Não há tabela de notificação, e é de propósito: uma tabela exigiria gerar, entregar,
 * marcar como lida e limpar o que ficou para trás — quatro problemas para responder a uma
 * pergunta que o banco já sabe responder a qualquer momento. Derivar também garante que o
 * aviso some sozinho quando a causa dele deixa de existir, sem ninguém precisar apagá-lo.
 *
 * A entrega é dentro do app. Não há SMTP, push nem fila neste sistema, por decisão de
 * arquitetura — quem não abre o app não é avisado, e o Manual diz isso.
 *
 * A **confirmação de leitura** é a única coisa persistida: guarda-se qual aviso a pessoa
 * viu e em que estado, nunca o aviso em si.
 */
export const tipoDeAvisoSchema = z.enum([
  /** Venceu e ninguém pagou. */
  'ATRASADO',
  /** Vence nos próximos dias. */
  'VENCE_EM_BREVE',
  /** Alguém declarou pagamento e você precisa confirmar. */
  'CONFIRMAR_PAGAMENTO',
  /** O limite de uma categoria foi ultrapassado no mês. */
  'LIMITE_ESTOURADO',
  /** Um fechamento combinado para repetir todo mês está pronto. */
  'FECHAMENTO_PENDENTE',
]);

export const GRAVIDADE_DO_AVISO: Record<z.infer<typeof tipoDeAvisoSchema>, 'alta' | 'media'> = {
  ATRASADO: 'alta',
  LIMITE_ESTOURADO: 'alta',
  VENCE_EM_BREVE: 'media',
  CONFIRMAR_PAGAMENTO: 'media',
  FECHAMENTO_PENDENTE: 'media',
};

export const avisoSchema = z.object({
  /** Estável para a mesma causa, para o React não remontar a lista a cada consulta. */
  id: z.string(),
  tipo: tipoDeAvisoSchema,
  titulo: z.string(),
  detalhe: z.string(),
  /** Para onde o toque leva. Um aviso sem ação é só um susto. */
  link: z.string(),
  valor: z.string().nullable(),
  /**
   * Se a pessoa já confirmou ter lido **este estado** do aviso.
   *
   * A confirmação some com o aviso da lista ativa e do contador, mas não silencia a causa:
   * se o motivo mudar — a dívida atrasada que recebeu um pagamento parcial e agora cobra
   * outro valor — ele volta a aparecer como não lido.
   */
  lido: z.boolean(),
});

export const avisosSchema = z.object({
  /** Os que ainda não foram confirmados. */
  itens: z.array(avisoSchema),
  /** Os já confirmados, para conferência. A tela os mostra sob demanda. */
  lidos: z.array(avisoSchema),
  /** Quantos não lidos são de gravidade alta. É o número do contador vermelho. */
  urgentes: z.number().int(),
});

/** Confirma a leitura de avisos específicos, ou de todos os que estão na tela. */
export const confirmarLeituraSchema = z
  .object({
    avisoIds: z.array(z.string().min(1)).optional(),
    /** Verdadeiro confirma todos os não lidos de uma vez. */
    todos: z.boolean().optional(),
  })
  .refine((dados) => dados.todos || (dados.avisoIds?.length ?? 0) > 0, 'Informe o que confirmar');

export const resultadoDaLeituraSchema = z.object({ confirmados: z.number().int() });

/** Janela padrão do "vence em breve". Sete dias cobrem a semana à frente. */
export const DIAS_DE_AVISO_DE_VENCIMENTO = 7;

export type TipoDeAviso = z.infer<typeof tipoDeAvisoSchema>;
export type ConfirmarLeitura = z.infer<typeof confirmarLeituraSchema>;
export type Aviso = z.infer<typeof avisoSchema>;
export type Avisos = z.infer<typeof avisosSchema>;
