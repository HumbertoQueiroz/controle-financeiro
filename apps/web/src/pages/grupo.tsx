import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Membro, Pessoa, PreviaDoFechamento } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

interface Evento {
  id: string;
  nome: string;
  data: string;
  total: string;
}

export function DetalheDoGrupo() {
  const { id = '' } = useParams();
  const clienteDeQuery = useQueryClient();
  const [painel, setPainel] = useState<'nenhum' | 'membro' | 'role'>('nenhum');
  const [periodo, setPeriodo] = useState(mesAtual());
  const [confirmandoFechamento, setConfirmandoFechamento] = useState(false);

  const membros = useQuery({
    queryKey: ['membros', id],
    queryFn: () => api.get<Membro[]>(`/grupos/${id}/membros`),
  });
  const eventos = useQuery({
    queryKey: ['roles', id],
    queryFn: () => api.get<Evento[]>(`/grupos/${id}/roles`),
  });
  const pessoas = useQuery({ queryKey: ['pessoas'], queryFn: () => api.get<Pessoa[]>('/pessoas') });

  const previa = useQuery({
    queryKey: ['fechamento', id, periodo],
    queryFn: () => api.get<PreviaDoFechamento>(`/grupos/${id}/fechamento?periodo=${periodo}`),
  });

  const invalidarTudo = async () => {
    await Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['membros', id] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['roles', id] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['fechamento', id] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
    ]);
  };

  const adicionarMembro = useMutation({
    mutationFn: (pessoaId: string) => api.post(`/grupos/${id}/membros`, { pessoaId }),
    onSuccess: async () => {
      setPainel('nenhum');
      await invalidarTudo();
    },
  });

  const criarRole = useMutation({
    mutationFn: (dados: { nome: string; data: string }) => api.post(`/grupos/${id}/roles`, dados),
    onSuccess: async () => {
      setPainel('nenhum');
      await invalidarTudo();
    },
  });

  const fechar = useMutation({
    mutationFn: () => api.post(`/grupos/${id}/fechamento`, { periodo }),
    onSuccess: async () => {
      setConfirmandoFechamento(false);
      await invalidarTudo();
    },
  });

  const idsDosMembros = new Set(membros.data?.map((membro) => membro.pessoaId));
  const disponiveis = pessoas.data?.filter((pessoa) => !idsDosMembros.has(pessoa.id)) ?? [];

  return (
    <>
      <section className="flex flex-col gap-3">
        <TituloDaSecao
          titulo="Participantes"
          acao={
            <Button variante="secundaria" tamanho="pequeno" onClick={() => setPainel('membro')}>
              <Plus size={16} aria-hidden />
              Adicionar
            </Button>
          }
        />

        {membros.isLoading && <Carregando linhas={2} />}

        {membros.data && (
          <div className="flex flex-wrap gap-2">
            {membros.data.map((membro) => (
              <span
                key={membro.pessoaId}
                className="rounded-full border border-borda px-3 py-1.5 text-sm text-texto"
              >
                {membro.nome}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloDaSecao
          titulo="Rolês"
          acao={
            <Button variante="secundaria" tamanho="pequeno" onClick={() => setPainel('role')}>
              <Plus size={16} aria-hidden />
              Novo rolê
            </Button>
          }
        />

        {eventos.isLoading && <Carregando linhas={2} />}

        {eventos.data?.length === 0 && (
          <Vazio
            titulo="Nenhum rolê ainda"
            descricao="Crie um rolê para lançar as despesas dele."
          />
        )}

        {eventos.data && eventos.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {eventos.data.map((evento) => (
              <li key={evento.id}>
                <Link to={`/app/roles/${evento.id}`}>
                  <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 transition-colors hover:bg-superficie-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium text-texto">{evento.nome}</p>
                      <p className="text-xs text-texto-suave">{formatarData(evento.data)}</p>
                    </div>
                    <Valor valor={evento.total} />
                  </Cartao>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloDaSecao titulo="Fechamento do mês" descricao="Quem paga quem, já compensado." />

        <Cartao className="flex flex-col gap-4 p-4">
          <Campo rotulo="Mês">
            {(campoId) => (
              <Input
                id={campoId}
                type="month"
                value={periodo}
                onChange={(evento) => setPeriodo(evento.target.value)}
              />
            )}
          </Campo>

          {previa.isLoading && <Carregando linhas={2} />}
          {previa.isError && <Erro mensagem="Não foi possível calcular" />}

          {previa.data && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-texto">Saldo de cada um</p>

                {previa.data.saldos.length === 0 && (
                  <p className="text-sm text-texto-suave">
                    Nenhuma despesa em {formatarMes(periodo)}.
                  </p>
                )}

                {previa.data.saldos.map((saldo) => (
                  <div key={saldo.pessoaId} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-texto">{saldo.nome}</span>
                    {/* Sinal sempre visível: quem não distingue verde de vermelho precisa
                        do "+" e do "−" para ler a coluna. */}
                    <Valor valor={saldo.saldo} tom="automatico" />
                  </div>
                ))}
              </div>

              {previa.data.transferencias.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-borda pt-4">
                  <p className="text-sm font-medium text-texto">Para acertar</p>

                  {previa.data.transferencias.map((transferencia, indice) => (
                    <div
                      key={`${transferencia.dePessoaId}-${transferencia.paraPessoaId}-${indice}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-texto">
                        {transferencia.de} paga {transferencia.para}
                      </span>
                      <Valor valor={transferencia.valor} />
                    </div>
                  ))}

                  <Button
                    variante="secundaria"
                    largura="cheia"
                    onClick={() => setConfirmandoFechamento(true)}
                  >
                    Fechar {formatarMes(periodo)}
                  </Button>
                </div>
              )}
            </>
          )}
        </Cartao>
      </section>

      <Painel
        aberto={painel === 'membro'}
        aoFechar={() => setPainel('nenhum')}
        titulo="Adicionar participante"
        descricao={
          disponiveis.length === 0 ? 'Cadastre a pessoa antes, na tela Pessoas.' : undefined
        }
      >
        {disponiveis.length > 0 && (
          <form
            onSubmit={(evento: FormEvent<HTMLFormElement>) => {
              evento.preventDefault();
              adicionarMembro.mutate(String(new FormData(evento.currentTarget).get('pessoaId')));
            }}
            className="flex flex-col gap-4"
          >
            <Campo rotulo="Pessoa">
              {(campoId) => (
                <Select id={campoId} name="pessoaId" required>
                  {disponiveis.map((pessoa) => (
                    <option key={pessoa.id} value={pessoa.id}>
                      {pessoa.nome}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>

            <Button type="submit" largura="cheia">
              Adicionar
            </Button>
          </form>
        )}
      </Painel>

      <Painel aberto={painel === 'role'} aoFechar={() => setPainel('nenhum')} titulo="Novo rolê">
        <form
          onSubmit={(evento: FormEvent<HTMLFormElement>) => {
            evento.preventDefault();
            const dados = new FormData(evento.currentTarget);
            criarRole.mutate({ nome: String(dados.get('nome')), data: String(dados.get('data')) });
          }}
          className="flex flex-col gap-4"
        >
          <Campo rotulo="Nome">
            {(campoId) => (
              <Input id={campoId} name="nome" placeholder="Churrasco" required autoFocus />
            )}
          </Campo>

          <Campo rotulo="Data" auxilio="É a data do rolê que define em que mês ele entra.">
            {(campoId) => <Input id={campoId} name="data" type="date" required />}
          </Campo>

          <Button type="submit" largura="cheia">
            Criar
          </Button>
        </form>
      </Painel>

      <Painel
        aberto={confirmandoFechamento}
        aoFechar={() => setConfirmandoFechamento(false)}
        titulo={`Fechar ${formatarMes(periodo)}?`}
        // Ação irreversível: dizer o que vai acontecer antes, não depois.
        descricao="As dívidas do mês serão substituídas pelo plano de pagamentos acima. Isso não pode ser desfeito."
        rodape={
          <>
            <Button variante="secundaria" onClick={() => setConfirmandoFechamento(false)}>
              Cancelar
            </Button>
            <Button onClick={() => fechar.mutate()} disabled={fechar.isPending}>
              {fechar.isPending ? 'Fechando…' : 'Fechar mês'}
            </Button>
          </>
        }
      >
        {fechar.isError && (
          <p role="alert" className="text-sm text-negativo">
            {fechar.error instanceof Error ? fechar.error.message : 'Não foi possível fechar'}
          </p>
        )}
      </Painel>
    </>
  );
}
