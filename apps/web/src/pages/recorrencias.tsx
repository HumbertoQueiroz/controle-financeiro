import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, PencilSimple, Prohibit } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { Categoria, Recorrencia } from '@controle/shared';
import {
  ROTULO_DA_DIRECAO,
  ROTULO_DA_FORMA_DE_PAGAMENTO,
  formaDePagamentoSchema,
} from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

/**
 * As contas que se repetem todo mês: salário, aluguel, internet, água, luz.
 *
 * A criação continua no painel de lançamento, com a marca "Se repete todo mês" — é lá que
 * a pessoa está quando percebe que a conta é recorrente. Esta tela é para **depois**: ver
 * o que está ativo, corrigir o valor que mudou e encerrar o que acabou.
 */
export function Recorrencias() {
  const clienteDeQuery = useQueryClient();
  const [editando, setEditando] = useState<Recorrencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['recorrencias'],
    queryFn: () => api.get<Recorrencia[]>('/recorrencias'),
  });

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get<Categoria[]>('/categorias'),
  });

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['recorrencias'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
    ]);

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.patch(`/recorrencias/${editando!.id}`, dados),
    onSuccess: async () => {
      setEditando(null);
      setErro(null);
      await invalidar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const encerrar = useMutation({
    mutationFn: (id: string) => api.delete(`/recorrencias/${id}`),
    onSuccess: invalidar,
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const campos = new FormData(evento.currentTarget);

    salvar.mutate({
      descricao: String(campos.get('descricao')),
      valor: String(campos.get('valor')),
      diaDoVencimento: Number(campos.get('diaDoVencimento')),
      formaDePagamento: String(campos.get('formaDePagamento')),
      contraparte: String(campos.get('contraparte') ?? ''),
      fimEm: String(campos.get('fimEm') ?? ''),
      categoriaId: String(campos.get('categoriaId') ?? ''),
    });
  };

  const ativas = lista.data?.filter((item) => item.ativa) ?? [];
  const encerradas = lista.data?.filter((item) => !item.ativa) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <TituloDaSecao
        titulo="Recorrentes"
        descricao="O que se repete todo mês. Cadastre no lançamento, marcando “Se repete todo mês”."
      />

      {lista.isLoading && <Carregando />}
      {lista.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
      )}

      {lista.data?.length === 0 && (
        <Vazio
          titulo="Nenhuma conta recorrente"
          descricao="Ao lançar o salário ou o aluguel, marque “Se repete todo mês” e ele passa a nascer sozinho."
        />
      )}

      <Secao
        titulo="Ativas"
        itens={ativas}
        aoEditar={(item) => {
          setErro(null);
          setEditando(item);
        }}
        aoEncerrar={(id) => encerrar.mutate(id)}
      />

      <Secao titulo="Encerradas" itens={encerradas} />

      <Painel
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo="Editar recorrente"
        descricao="A mudança vale para as próximas parcelas. As já criadas ficam como estão."
      >
        <form key={editando?.id} onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Descrição">
            {(id) => <Input id={id} name="descricao" defaultValue={editando?.descricao} required />}
          </Campo>

          <Campo rotulo="Valor">
            {(id) => (
              <Input
                id={id}
                name="valor"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={editando?.valor}
                required
              />
            )}
          </Campo>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Campo
                rotulo="Dia do vencimento"
                auxilio="Meses sem esse dia usam o último dia do mês."
              >
                {(id) => (
                  <Input
                    id={id}
                    name="diaDoVencimento"
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={editando?.diaDoVencimento}
                    required
                  />
                )}
              </Campo>
            </div>

            <div className="flex-1">
              <Campo rotulo="Forma de pagamento">
                {(id) => (
                  <Select
                    id={id}
                    name="formaDePagamento"
                    defaultValue={editando?.formaDePagamento ?? 'CASH'}
                  >
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

          <Campo rotulo="De quem / para quem">
            {(id) => (
              <Input
                id={id}
                name="contraparte"
                placeholder="Empresa X"
                defaultValue={editando?.contraparte ?? ''}
              />
            )}
          </Campo>

          <Campo rotulo="Categoria">
            {(id) => (
              <Select id={id} name="categoriaId" defaultValue={editando?.categoriaId ?? ''}>
                <option value="">Sem categoria</option>
                {categorias.data?.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo rotulo="Até (opcional)" auxilio="Deixe vazio para não ter prazo.">
            {(id) => (
              <Input
                id={id}
                name="fimEm"
                placeholder="2027-12"
                pattern="\d{4}-\d{2}"
                defaultValue={editando?.fimEm ?? ''}
              />
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Painel>
    </div>
  );
}

function Secao({
  titulo,
  itens,
  aoEditar,
  aoEncerrar,
}: {
  titulo: string;
  itens: Recorrencia[];
  aoEditar?: (item: Recorrencia) => void;
  aoEncerrar?: (id: string) => void;
}) {
  if (itens.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>

      <ul className="flex flex-col gap-2">
        {itens.map((item) => (
          <li key={item.id}>
            <Cartao className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate font-medium text-texto">{item.descricao}</p>
                  <p className="text-xs text-texto-suave">
                    {ROTULO_DA_DIRECAO[item.direcao]} · todo dia {item.diaDoVencimento}
                    {item.contraparte && ` · ${item.contraparte}`}
                    {item.categoria && ` · ${item.categoria}`}
                  </p>
                  <p className="text-xs text-texto-suave">
                    {/* O próximo vencimento é o que responde "quando isso cai de novo". O
                        dia do mês sozinho não diz se a vigência já acabou. */}
                    {item.proximoVencimento
                      ? `Próxima em ${formatarData(item.proximoVencimento)}`
                      : 'Sem próxima parcela'}
                    {item.parcelasGeradas > 0 && ` · ${item.parcelasGeradas} já geradas`}
                    {item.fimEm && ` · até ${item.fimEm}`}
                  </p>
                </div>

                <Valor valor={item.valor} />
              </div>

              {(aoEditar || aoEncerrar) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-borda pt-3">
                  {aoEditar && (
                    <Button variante="secundaria" tamanho="pequeno" onClick={() => aoEditar(item)}>
                      <PencilSimple size={16} aria-hidden />
                      Editar
                    </Button>
                  )}

                  {aoEncerrar && (
                    <Button
                      variante="fantasma"
                      tamanho="pequeno"
                      onClick={() => aoEncerrar(item.id)}
                    >
                      <Prohibit size={16} aria-hidden />
                      Encerrar
                    </Button>
                  )}
                </div>
              )}

              {!aoEditar && (
                <p className="flex items-center gap-1 border-t border-borda pt-3 text-xs text-texto-suave">
                  <ArrowsClockwise size={14} aria-hidden />
                  {/* Encerrar não apaga o passado: as parcelas antigas são lançamentos de
                      verdade, com baixa. Apagá-las mudaria o caixa de meses fechados. */}
                  Encerrada. As parcelas já geradas continuam nos meses delas.
                </p>
              )}
            </Cartao>
          </li>
        ))}
      </ul>
    </section>
  );
}
