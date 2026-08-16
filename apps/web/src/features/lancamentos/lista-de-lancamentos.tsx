import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, Check, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { Lancamento } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, hoje } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao } from '@/components/ui/cartao';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

const ROTULO_DA_ORIGEM: Record<Lancamento['origem'], string> = {
  INVOICE: 'Fatura',
  CARD_ENTRY: 'Repasse',
  GROUP_EXPENSE: 'Rateio',
  RECURRENCE: 'Recorrente',
  MANUAL: 'Avulso',
};

export function ListaDeLancamentos({ itens }: { itens: Lancamento[] }) {
  const clienteDeQuery = useQueryClient();
  const [baixando, setBaixando] = useState<Lancamento | null>(null);

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
    ]);

  const estornar = useMutation({
    mutationFn: (id: string) => api.delete(`/lancamentos/${id}/baixa`),
    onSuccess: invalidar,
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/lancamentos/${id}`),
    onSuccess: invalidar,
  });

  return (
    <>
      <ul className="flex flex-col gap-2">
        {itens.map((item) => {
          const baixado = item.status === 'SETTLED';

          return (
            <li key={item.id}>
              <Cartao className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-texto">{item.descricao}</p>

                    <p className="text-xs text-texto-suave">
                      {item.contraparte ? `${item.contraparte} · ` : ''}
                      {ROTULO_DA_ORIGEM[item.origem]}
                    </p>

                    {/* As duas datas juntas: o que foi combinado e o que aconteceu. */}
                    <p className="text-xs text-texto-suave">
                      Vence {formatarData(item.vencimento)}
                      {item.dataDaBaixa && ` · baixado em ${formatarData(item.dataDaBaixa)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Valor valor={item.restante === '0.00' ? item.valor : item.restante} />

                    {baixado && (
                      <span className="rounded-full bg-positivo-suave px-2 py-0.5 text-xs text-positivo">
                        Baixado
                      </span>
                    )}

                    {/* Atrasado leva rótulo além da cor: só vermelho não se lê. */}
                    {item.atrasado && (
                      <span className="rounded-full bg-negativo-suave px-2 py-0.5 text-xs text-negativo">
                        Atrasado
                      </span>
                    )}

                    {item.status === 'PARTIAL' && (
                      <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-texto-suave">
                        Parcial
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-borda pt-3">
                  {baixado ? (
                    <Button
                      variante="secundaria"
                      tamanho="pequeno"
                      onClick={() => estornar.mutate(item.id)}
                    >
                      <ArrowCounterClockwise size={16} aria-hidden />
                      Estornar baixa
                    </Button>
                  ) : (
                    <Button tamanho="pequeno" onClick={() => setBaixando(item)}>
                      <Check size={16} aria-hidden />
                      Dar baixa
                    </Button>
                  )}

                  {item.editavel && !baixado && item.valorLiquidado === '0' && (
                    <Button
                      variante="fantasma"
                      tamanho="pequeno"
                      onClick={() => excluir.mutate(item.id)}
                    >
                      <Trash size={16} aria-hidden />
                      Excluir
                    </Button>
                  )}
                </div>
              </Cartao>
            </li>
          );
        })}
      </ul>

      <PainelDeBaixa
        lancamento={baixando}
        aoFechar={() => setBaixando(null)}
        aoConcluir={invalidar}
      />
    </>
  );
}

/**
 * Baixa: a segunda data do lançamento.
 *
 * A data é preenchida com hoje mas continua editável — quem registra no domingo o que
 * pagou na sexta precisa que o caixa mostre sexta, senão o fechamento erra na virada do mês.
 */
function PainelDeBaixa({
  lancamento,
  aoFechar,
  aoConcluir,
}: {
  lancamento: Lancamento | null;
  aoFechar: () => void;
  aoConcluir: () => Promise<unknown>;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [parcial, setParcial] = useState(false);

  const darBaixa = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post(`/lancamentos/${lancamento!.id}/baixa`, dados),
    onSuccess: async () => {
      setErro(null);
      setParcial(false);
      await aoConcluir();
      aoFechar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const valorPago = String(dados.get('valorPago') ?? '');

    darBaixa.mutate({
      dataDaBaixa: String(dados.get('dataDaBaixa')),
      ...(parcial && valorPago ? { valorPago } : {}),
    });
  };

  return (
    <Painel
      aberto={Boolean(lancamento)}
      aoFechar={aoFechar}
      titulo="Dar baixa"
      descricao={lancamento ? `${lancamento.descricao} — falta ${lancamento.restante}` : undefined}
    >
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <Campo rotulo="Data da baixa" auxilio="Quando o dinheiro se moveu de verdade.">
          {(id) => <Input id={id} name="dataDaBaixa" type="date" defaultValue={hoje()} required />}
        </Campo>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
          <input
            type="checkbox"
            checked={parcial}
            onChange={(evento) => setParcial(evento.target.checked)}
            className="h-4 w-4"
          />
          Paguei só uma parte
        </label>

        {parcial && (
          <Campo rotulo="Valor pago">
            {(id) => (
              <Input
                id={id}
                name="valorPago"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
              />
            )}
          </Campo>
        )}

        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}

        <Button type="submit" largura="cheia" disabled={darBaixa.isPending}>
          {darBaixa.isPending ? 'Registrando…' : 'Registrar baixa'}
        </Button>
      </form>
    </Painel>
  );
}
