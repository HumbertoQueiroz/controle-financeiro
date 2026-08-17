import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { ResultadoDoFechamento } from '@controle/shared';
import {
  ROTULO_DA_FORMA_DE_PAGAMENTO,
  deCentavos,
  descricaoDoAcerto,
  formatarValor,
  formaDePagamentoSchema,
} from '@controle/shared';
import { api } from '@/lib/api';
import { hoje } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Painel } from '@/components/ui/painel';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  participanteId: string;
  mes: string;
  numero: number;
  nomeDoParticipante: string;
  lancamentosIds: string[];
  /** Positivo: o participante deve a você. Negativo: você deve a ele. */
  saldoEmCentavos: number;
  aoConcluir: () => Promise<unknown>;
}

/**
 * Confirmação da quitação em lote.
 *
 * O painel é a última tela antes de mexer em vários títulos de uma vez, então ele repete
 * o que vai acontecer em vez de só perguntar "tem certeza?" — quem chegou aqui por engano
 * precisa reconhecer o engano pela descrição, não pelo resultado.
 */
export function PainelDeQuitacao({
  aberto,
  aoFechar,
  participanteId,
  mes,
  numero,
  nomeDoParticipante,
  lancamentosIds,
  saldoEmCentavos,
  aoConcluir,
}: Props) {
  const clienteDeQuery = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [lancarAcerto, setLancarAcerto] = useState(true);

  const temSaldo = saldoEmCentavos !== 0;
  const souOCredorDoAcerto = saldoEmCentavos > 0;

  const quitar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post<ResultadoDoFechamento>(`/participantes/${participanteId}/fechamento/quitar`, dados),
    onSuccess: async () => {
      setErro(null);
      await Promise.all([
        clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
      ]);
      await aoConcluir();
      aoFechar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const campos = new FormData(evento.currentTarget);

    quitar.mutate({
      mes,
      lancamentosIds,
      dataDaQuitacao: String(campos.get('dataDaQuitacao')),
      ...(temSaldo && lancarAcerto
        ? {
            novoTitulo: {
              descricao: String(campos.get('descricao')),
              vencimento: String(campos.get('vencimento')),
              formaDePagamento: String(campos.get('formaDePagamento')),
            },
          }
        : {}),
    });
  };

  return (
    <Painel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Fechamento nº ${numero}`}
      descricao={`${lancamentosIds.length} conta${lancamentosIds.length === 1 ? '' : 's'} de ${nomeDoParticipante} ${lancamentosIds.length === 1 ? 'será quitada' : 'serão quitadas'}.`}
    >
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <Campo
          rotulo="Data da quitação"
          auxilio="A data que ficará registrada em cada baixa deste fechamento."
        >
          {(id) => (
            <Input id={id} name="dataDaQuitacao" type="date" defaultValue={hoje()} required />
          )}
        </Campo>

        {temSaldo ? (
          <>
            <div className="flex flex-col gap-1 rounded-padrao border border-borda p-3">
              <p className="text-sm text-texto">
                Sobra {formatarValor(deCentavos(Math.abs(saldoEmCentavos)))} de diferença.
              </p>
              <p className="text-xs text-texto-suave">
                {souOCredorDoAcerto
                  ? `${nomeDoParticipante} fica devendo esse valor a você.`
                  : `Você fica devendo esse valor a ${nomeDoParticipante}.`}
              </p>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
              <input
                type="checkbox"
                checked={lancarAcerto}
                onChange={(evento) => setLancarAcerto(evento.target.checked)}
                className="h-4 w-4"
              />
              Lançar a diferença como uma nova conta
            </label>

            {lancarAcerto && (
              <>
                <Campo rotulo="Descrição do acerto">
                  {(id) => (
                    <Input
                      id={id}
                      name="descricao"
                      // Pré-preenchida pela mesma função que o servidor usa, para o texto
                      // padrão da tela ser exatamente o texto que ficaria gravado.
                      defaultValue={descricaoDoAcerto(numero, mes)}
                      required
                    />
                  )}
                </Campo>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1">
                    <Campo rotulo="Vencimento">
                      {(id) => (
                        <Input
                          id={id}
                          name="vencimento"
                          type="date"
                          defaultValue={hoje()}
                          required
                        />
                      )}
                    </Campo>
                  </div>

                  <div className="flex-1">
                    <Campo rotulo="Forma de pagamento">
                      {(id) => (
                        <Select id={id} name="formaDePagamento" defaultValue="CASH">
                          {formaDePagamentoSchema.options.map((forma) => (
                            <option key={forma} value={forma}>
                              {ROTULO_DA_FORMA_DE_PAGAMENTO[forma]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Campo>
                  </div>
                </div>
              </>
            )}

            {!lancarAcerto && (
              <p className="text-xs text-texto-suave">
                Sem a nova conta, a diferença deixa de existir no sistema — as contas quitadas somem
                e nada registra que ainda há valor entre vocês.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-texto-suave">
            Os dois lados se anulam. Nada fica pendente depois deste fechamento.
          </p>
        )}

        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}

        <Button type="submit" largura="cheia" disabled={quitar.isPending}>
          {quitar.isPending ? 'Quitando…' : 'Confirmar fechamento'}
        </Button>
      </form>
    </Painel>
  );
}
