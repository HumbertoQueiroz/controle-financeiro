import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Cartao as TipoDeCartao } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';

export function Cartoes() {
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['cartoes'],
    queryFn: () => api.get<TipoDeCartao[]>('/cartoes'),
  });

  const criar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.post<TipoDeCartao>('/cartoes', dados),
    onSuccess: async () => {
      setAberto(false);
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['cartoes'] });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    criar.mutate({
      nome: String(dados.get('nome')),
      bandeira: String(dados.get('bandeira') ?? '') || undefined,
      finalDoCartao: String(dados.get('finalDoCartao') ?? '') || undefined,
      diaDeFechamento: Number(dados.get('diaDeFechamento')),
      diaDeVencimento: Number(dados.get('diaDeVencimento')),
      compartilhado: dados.get('compartilhado') === 'on',
    });
  };

  return (
    <>
      <TituloDaSecao
        titulo="Cartões"
        acao={
          <Button onClick={() => setAberto(true)}>
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
          acao={<Button onClick={() => setAberto(true)}>Cadastrar cartão</Button>}
        />
      )}

      {lista.data && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((cartao) => (
            <li key={cartao.id}>
              <Link to={`/app/cartoes/${cartao.id}`}>
                <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 transition-colors hover:bg-superficie-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium text-texto">{cartao.nome}</p>
                    <p className="text-xs text-texto-suave">
                      {cartao.bandeira && `${cartao.bandeira} · `}
                      {/* Só os quatro últimos existem no sistema — o número completo,
                          CVV e validade nunca entram no banco. */}
                      {cartao.finalDoCartao ? `final ${cartao.finalDoCartao} · ` : ''}
                      vence dia {cartao.diaDeVencimento}
                    </p>
                  </div>
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Painel aberto={aberto} aoFechar={() => setAberto(false)} titulo="Novo cartão">
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(id) => <Input id={id} name="nome" placeholder="Nubank" required autoFocus />}
          </Campo>

          <Campo rotulo="Bandeira (opcional)">{(id) => <Input id={id} name="bandeira" />}</Campo>

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
              />
            )}
          </Campo>

          <div className="flex gap-3">
            <div className="flex-1">
              <Campo rotulo="Dia de fechamento">
                {(id) => (
                  <Input id={id} name="diaDeFechamento" type="number" min={1} max={31} required />
                )}
              </Campo>
            </div>

            <div className="flex-1">
              <Campo rotulo="Dia de vencimento">
                {(id) => (
                  <Input id={id} name="diaDeVencimento" type="number" min={1} max={31} required />
                )}
              </Campo>
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
            <input type="checkbox" name="compartilhado" className="h-4 w-4" />
            Cartão compartilhado com outras pessoas
          </label>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Painel>
    </>
  );
}
