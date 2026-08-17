import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Trash } from '@phosphor-icons/react';
import type { Parcelamento } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarMes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Valor } from '@/components/ui/valor';
import { SeletorDePessoa } from '@/features/pessoas/seletor-de-pessoa';

/**
 * Todos os parcelamentos em curso, num lugar só.
 *
 * A pergunta que esta tela responde é a que não cabe na fatura: quanto ainda falta de cada
 * compra parcelada, e em que meses ela vai continuar aparecendo. Olhando fatura a fatura,
 * isso exigiria abrir doze meses e somar à mão.
 */
export function Parcelamentos() {
  const clienteDeQuery = useQueryClient();

  const parcelamentos = useQuery({
    queryKey: ['parcelamentos'],
    queryFn: () => api.get<Parcelamento[]>('/parcelamentos'),
  });

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['parcelamentos'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['faturas'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
    ]);

  const trocarResponsavel = useMutation({
    mutationFn: ({ id, pessoaId }: { id: string; pessoaId: string | null }) =>
      api.patch(`/parcelamentos/${id}`, { responsavelPessoaId: pessoaId }),
    onSuccess: invalidar,
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/parcelamentos/${id}`),
    onSuccess: invalidar,
  });

  return (
    <>
      <TituloDaSecao
        titulo="Parcelamentos"
        descricao="Compras parceladas em curso, com o que já veio e o que ainda vai vir."
      />

      {parcelamentos.isLoading && <Carregando linhas={3} />}
      {parcelamentos.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => parcelamentos.refetch()} />
      )}

      {parcelamentos.data?.length === 0 && (
        <Vazio
          titulo="Nenhum parcelamento"
          descricao="Compras parceladas aparecem aqui quando você importa a fatura do cartão."
        />
      )}

      {parcelamentos.data && parcelamentos.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {parcelamentos.data.map((parcelamento) => (
            <li key={parcelamento.id}>
              <Cartao className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate font-medium text-texto">{parcelamento.descricao}</p>

                    {/* A etiqueta do cartão: olhando um lançamento solto não se sabe em
                        qual cartão a compra foi passada. */}
                    <span className="flex w-fit items-center gap-1 rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-texto-suave">
                      <CreditCard size={12} aria-hidden />
                      {parcelamento.cartao}
                    </span>

                    <p className="text-xs text-texto-suave">
                      {parcelamento.parcelasPagas} de {parcelamento.quantidadeDeParcelas} parcelas
                      de {parcelamento.valorDaParcela}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Valor valor={parcelamento.valorTotal} />
                    <span className="text-xs text-texto-suave">
                      falta <Valor valor={parcelamento.restante} className="text-xs" />
                    </span>
                  </div>
                </div>

                {/* Uma etiqueta por parcela, com o mês da fatura em que ela cai. */}
                <div className="flex flex-wrap gap-1.5 border-t border-borda pt-3">
                  {parcelamento.parcelas.map((parcela) => (
                    <span
                      key={parcela.id}
                      className={
                        parcela.projetada
                          ? 'rounded-full border border-dashed border-borda px-2 py-0.5 text-xs text-texto-suave'
                          : 'rounded-full bg-destaque-suave px-2 py-0.5 text-xs text-destaque'
                      }
                      title={parcela.projetada ? 'Ainda não veio no extrato' : 'Já veio no extrato'}
                    >
                      {parcela.numero ? `${parcela.numero}ª · ` : ''}
                      {formatarMes(parcela.fatura)}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col gap-2 border-t border-borda pt-3 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-texto-suave">Quem paga</span>
                    <SeletorDePessoa
                      valor={parcelamento.responsavelPessoaId}
                      aoMudar={(pessoaId) =>
                        trocarResponsavel.mutate({ id: parcelamento.id, pessoaId })
                      }
                      rotulo={`Quem paga ${parcelamento.descricao}`}
                    />
                  </label>

                  <Button
                    variante="fantasma"
                    tamanho="pequeno"
                    onClick={() => excluir.mutate(parcelamento.id)}
                  >
                    <Trash size={16} aria-hidden />
                    Remover parcelas futuras
                  </Button>
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
