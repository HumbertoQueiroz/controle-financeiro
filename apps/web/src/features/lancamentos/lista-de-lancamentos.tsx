import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, Check, Receipt, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { Lancamento, ResumoDeContas } from '@controle/shared';
import { deCentavos, formatarValor, paraCentavos } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, hoje } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
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
  const [detalhando, setDetalhando] = useState<string | null>(null);

  // O painel lê da lista, e não de uma cópia guardada no estado: confirmar um pagamento
  // atualiza a lista, e uma cópia congelada continuaria mostrando "pendente" depois disso.
  const detalhado = itens.find((item) => item.id === detalhando) ?? null;

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['contas'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['avisos'] }),
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
          const pendentes = item.pagamentos.filter((pagamento) => !pagamento.confirmado).length;

          return (
            <li key={item.id}>
              <Cartao className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-texto">{item.descricao}</p>

                    <p className="flex items-center gap-1.5 text-xs text-texto-suave">
                      {/* O ponto colorido antes do nome: a cor sozinha não identifica a
                          categoria para quem não distingue matizes, o nome sim. */}
                      {item.categoria && (
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.categoriaCor ?? 'var(--cor-texto-suave)' }}
                        />
                      )}
                      <span className="truncate">
                        {item.categoria ? `${item.categoria} · ` : ''}
                        {item.contraparte ? `${item.contraparte} · ` : ''}
                        {ROTULO_DA_ORIGEM[item.origem]}
                      </span>
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

                    {/* A etiqueta mais importante do cartão quando existe: é o único aviso
                        de que alguém disse ter pagado e ninguém confirmou ainda. */}
                    {pendentes > 0 && (
                      <span className="rounded-full bg-atencao-suave px-2 py-0.5 text-xs text-atencao">
                        {item.podeConfirmarPagamentos
                          ? `${pendentes} a confirmar`
                          : 'Aguardando confirmação'}
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

                  {item.pagamentos.length > 0 && (
                    <Button
                      variante="secundaria"
                      tamanho="pequeno"
                      onClick={() => setDetalhando(item.id)}
                    >
                      <Receipt size={16} aria-hidden />
                      Pagamentos ({item.pagamentos.length})
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

      <PainelDePagamentos
        lancamento={detalhado}
        aoFechar={() => setDetalhando(null)}
        aoConcluir={invalidar}
      />
    </>
  );
}

/**
 * O histórico de pagamentos do título, com a confirmação de quem recebe.
 *
 * Um pagamento pendente aparece para os **dois** lados: quem declarou precisa ver que o
 * anúncio foi registrado, e quem recebe precisa ver que há algo esperando por ele. Mostrar
 * só para um lado faria um dos dois achar que nada aconteceu.
 */
function PainelDePagamentos({
  lancamento,
  aoFechar,
  aoConcluir,
}: {
  lancamento: Lancamento | null;
  aoFechar: () => void;
  aoConcluir: () => Promise<unknown>;
}) {
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = useMutation({
    mutationFn: (pagamentoId: string) =>
      api.post(`/lancamentos/${lancamento!.id}/pagamentos/${pagamentoId}/confirmar`, {}),
    onSuccess: async () => {
      setErro(null);
      await aoConcluir();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const remover = useMutation({
    mutationFn: (pagamentoId: string) =>
      api.delete(`/lancamentos/${lancamento!.id}/pagamentos/${pagamentoId}`),
    onSuccess: async () => {
      setErro(null);
      await aoConcluir();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  return (
    <Painel
      aberto={Boolean(lancamento)}
      aoFechar={aoFechar}
      titulo="Pagamentos"
      descricao={
        lancamento
          ? `${lancamento.descricao} — falta ${formatarValor(lancamento.restante)}`
          : undefined
      }
    >
      <ul className="flex flex-col gap-2">
        {lancamento?.pagamentos.map((pagamento) => (
          <li
            key={pagamento.id}
            className="flex flex-col gap-2 rounded-padrao border border-borda p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm text-texto">{formatarData(pagamento.pagoEm)}</p>
                {pagamento.observacao && (
                  <p className="text-xs text-texto-suave">{pagamento.observacao}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <Valor valor={pagamento.valor} />

                {pagamento.confirmado ? (
                  <span className="rounded-full bg-positivo-suave px-2 py-0.5 text-xs text-positivo">
                    Confirmado
                  </span>
                ) : (
                  <span className="rounded-full bg-atencao-suave px-2 py-0.5 text-xs text-atencao">
                    Pendente de confirmação
                  </span>
                )}
              </div>
            </div>

            {!pagamento.confirmado && (
              <p className="text-xs text-texto-suave">
                {lancamento.podeConfirmarPagamentos
                  ? 'Só entra no seu saldo depois que você confirmar que recebeu.'
                  : 'Só abate a dívida depois que quem recebe confirmar.'}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {/* O botão só aparece para quem recebe. A recusa da rota é o que vale;
                  esconder o botão é conveniência, não autorização. */}
              {lancamento.podeConfirmarPagamentos && !pagamento.confirmado && (
                <Button
                  tamanho="pequeno"
                  onClick={() => confirmar.mutate(pagamento.id)}
                  disabled={confirmar.isPending}
                >
                  <Check size={16} aria-hidden />
                  Confirmar pagamento
                </Button>
              )}

              <Button
                variante="fantasma"
                tamanho="pequeno"
                onClick={() => remover.mutate(pagamento.id)}
                disabled={remover.isPending}
              >
                <Trash size={16} aria-hidden />
                {lancamento.podeConfirmarPagamentos && !pagamento.confirmado
                  ? 'Não recebi'
                  : 'Remover'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {erro && (
        <p role="alert" className="pt-3 text-sm text-negativo">
          {erro}
        </p>
      )}
    </Painel>
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
  const [valorPago, setValorPago] = useState('');
  const [quitar, setQuitar] = useState(true);

  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: () => api.get<ResumoDeContas>('/contas'),
  });

  const restante = paraCentavos(lancamento?.restante ?? '0');
  const informado = valorPago ? paraCentavos(valorPago) : restante;
  const diferenca = informado - restante;

  const darBaixa = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post(`/lancamentos/${lancamento!.id}/baixa`, dados),
    onSuccess: async () => {
      setErro(null);
      setValorPago('');
      setQuitar(true);
      await aoConcluir();
      aoFechar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const contaId = String(dados.get('contaId') ?? '');

    darBaixa.mutate({
      dataDaBaixa: String(dados.get('dataDaBaixa')),
      ...(valorPago ? { valorPago } : {}),
      // Só faz diferença pagando a menor; a mais, o excedente é juros e o título quita de
      // qualquer jeito.
      quitar: diferenca < 0 ? quitar : false,
      ...(contaId ? { contaId } : {}),
    });
  };

  return (
    <Painel
      aberto={Boolean(lancamento)}
      aoFechar={aoFechar}
      titulo="Dar baixa"
      descricao={
        lancamento
          ? `${lancamento.descricao} — falta ${formatarValor(lancamento.restante)}`
          : undefined
      }
    >
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <Campo rotulo="Data da baixa" auxilio="Quando o dinheiro se moveu de verdade.">
          {(id) => <Input id={id} name="dataDaBaixa" type="date" defaultValue={hoje()} required />}
        </Campo>

        {/* Só aparece quando há conta cadastrada: um seletor com uma opção vazia é ruído
            para quem ainda não usa contas. */}
        {(contas.data?.contas.length ?? 0) > 0 && (
          <Campo rotulo="Conta" auxilio="Por onde o dinheiro passou. O saldo dela acompanha.">
            {(id) => (
              <Select id={id} name="contaId" defaultValue="">
                <option value="">Não informar</option>
                {contas.data?.contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        )}

        {/* O valor vem preenchido com o que falta, e continua editável. Pagar a mais é
            juros ou multa; a menos, ou é desconto ou é parcela — e essa é a única das duas
            que o sistema não tem como deduzir sozinho. */}
        <Campo rotulo="Valor pago" auxilio="Vem com o valor do título. Mude se pagou outro valor.">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={valorPago}
              onChange={(evento) => setValorPago(evento.target.value)}
              placeholder={lancamento?.restante ?? ''}
              required={false}
            />
          )}
        </Campo>

        {diferenca > 0 && (
          <p className="text-sm text-atencao">
            {formatarValor(deCentavos(diferenca))} a mais que o título — juros ou multa. O título
            fica quitado.
          </p>
        )}

        {diferenca < 0 && (
          <div className="flex flex-col gap-2 rounded-padrao border border-borda bg-superficie-2 p-3">
            <p className="text-sm text-texto">
              {formatarValor(deCentavos(-diferenca))} a menos que o título. O que aconteceu?
            </p>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-texto">
              <input
                type="radio"
                name="diferenca"
                checked={quitar}
                onChange={() => setQuitar(true)}
                className="h-4 w-4"
              />
              Desconto — o título está quitado
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-texto">
              <input
                type="radio"
                name="diferenca"
                checked={!quitar}
                onChange={() => setQuitar(false)}
                className="h-4 w-4"
              />
              Paguei só uma parte — o resto continua devendo
            </label>
          </div>
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
