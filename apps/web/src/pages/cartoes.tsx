import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilSimple, Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Cartao as TipoDeCartao } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';

/** Nulo com o painel fechado; o cartão em edição, ou `'novo'` para o cadastro. */
type EmEdicao = TipoDeCartao | 'novo' | null;

export function Cartoes() {
  const clienteDeQuery = useQueryClient();
  const [emEdicao, setEmEdicao] = useState<EmEdicao>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['cartoes'],
    queryFn: () => api.get<TipoDeCartao[]>('/cartoes'),
  });

  const editando = emEdicao !== null && emEdicao !== 'novo' ? emEdicao : null;

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      editando
        ? api.patch<TipoDeCartao>(`/cartoes/${editando.id}`, dados)
        : api.post<TipoDeCartao>('/cartoes', dados),
    onSuccess: async () => {
      setEmEdicao(null);
      setErro(null);
      // As faturas também mudam quando os dias de fechamento e vencimento mudam.
      await Promise.all([
        clienteDeQuery.invalidateQueries({ queryKey: ['cartoes'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['faturas'] }),
      ]);
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    salvar.mutate({
      nome: String(dados.get('nome')),
      // String vazia, e não `undefined`, para a edição conseguir **apagar** a bandeira: o
      // schema trata `''` como nulo, e `undefined` seria lido como "não mexer neste campo".
      bandeira: editando
        ? String(dados.get('bandeira') ?? '')
        : String(dados.get('bandeira') ?? '') || undefined,
      finalDoCartao: editando
        ? String(dados.get('finalDoCartao') ?? '')
        : String(dados.get('finalDoCartao') ?? '') || undefined,
      diaDeFechamento: Number(dados.get('diaDeFechamento')),
      diaDeVencimento: Number(dados.get('diaDeVencimento')),
      compartilhado: dados.get('compartilhado') === 'on',
      ...(editando ? { ativo: dados.get('ativo') === 'on' } : {}),
    });
  };

  return (
    <>
      <TituloDaSecao
        titulo="Cartões"
        acao={
          <Button onClick={() => setEmEdicao('novo')}>
            <Plus size={18} aria-hidden />
            Novo cartão
          </Button>
        }
      />

      {lista.isLoading && <Carregando />}
      {lista.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
      )}

      {lista.data?.length === 0 && (
        <Vazio
          titulo="Nenhum cartão cadastrado"
          descricao="Cadastre um cartão para importar a fatura e acompanhar os lançamentos."
          acao={<Button onClick={() => setEmEdicao('novo')}>Cadastrar cartão</Button>}
        />
      )}

      {lista.data && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((cartao) => (
            <li key={cartao.id}>
              {/* O lápis fica fora do Link: dentro dele, editar navegaria para a fatura. */}
              <Cartao className="flex min-h-14 items-center gap-1 p-1 transition-colors hover:bg-superficie-2">
                <Link to={`/app/cartoes/${cartao.id}`} className="flex min-w-0 flex-1 p-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-texto">
                      {cartao.nome}
                      {!cartao.ativo && (
                        <span className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-normal text-texto-suave">
                          Inativo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-texto-suave">
                      {cartao.bandeira && `${cartao.bandeira} · `}
                      {/* Só os quatro últimos existem no sistema — o número completo,
                          CVV e validade nunca entram no banco. */}
                      {cartao.finalDoCartao ? `final ${cartao.finalDoCartao} · ` : ''}
                      fecha dia {cartao.diaDeFechamento} · vence dia {cartao.diaDeVencimento}
                      {cartao.compartilhado && ' · compartilhado'}
                    </p>
                  </div>
                </Link>

                <Button
                  variante="fantasma"
                  tamanho="pequeno"
                  aria-label={`Editar ${cartao.nome}`}
                  onClick={() => {
                    setErro(null);
                    setEmEdicao(cartao);
                  }}
                >
                  <PencilSimple size={18} aria-hidden />
                </Button>
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      <Painel
        aberto={emEdicao !== null}
        aoFechar={() => setEmEdicao(null)}
        titulo={editando ? 'Editar cartão' : 'Novo cartão'}
        descricao={
          editando
            ? 'Mudar os dias de fechamento e vencimento reajusta as faturas ainda em aberto.'
            : undefined
        }
      >
        {/* A `key` refaz o formulário ao trocar de cartão: sem ela, os campos guardariam
            os valores do cartão anterior, porque são não-controlados. */}
        <form key={editando?.id ?? 'novo'} onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(id) => (
              <Input
                id={id}
                name="nome"
                placeholder="Nubank"
                defaultValue={editando?.nome}
                required
                autoFocus
              />
            )}
          </Campo>

          <Campo rotulo="Bandeira (opcional)">
            {(id) => <Input id={id} name="bandeira" defaultValue={editando?.bandeira ?? ''} />}
          </Campo>

          <Campo
            rotulo="4 últimos dígitos (opcional)"
            auxilio="Só os quatro últimos. O número completo e o CVV nunca são guardados."
          >
            {(id) => (
              <Input
                id={id}
                name="finalDoCartao"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                defaultValue={editando?.finalDoCartao ?? ''}
              />
            )}
          </Campo>

          <div className="flex gap-3">
            <div className="flex-1">
              <Campo rotulo="Dia de fechamento">
                {(id) => (
                  <Input
                    id={id}
                    name="diaDeFechamento"
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={editando?.diaDeFechamento}
                    required
                  />
                )}
              </Campo>
            </div>

            <div className="flex-1">
              <Campo rotulo="Dia de vencimento">
                {(id) => (
                  <Input
                    id={id}
                    name="diaDeVencimento"
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={editando?.diaDeVencimento}
                    required
                  />
                )}
              </Campo>
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
            <input
              type="checkbox"
              name="compartilhado"
              defaultChecked={editando?.compartilhado ?? false}
              className="h-4 w-4"
            />
            Cartão compartilhado com outras pessoas
          </label>

          {/* Inativar em vez de excluir: as faturas e os lançamentos continuam existindo,
              e apagar o cartão levaria embora o histórico junto. */}
          {editando && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={editando.ativo}
                className="h-4 w-4"
              />
              Cartão em uso
            </label>
          )}

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
    </>
  );
}
