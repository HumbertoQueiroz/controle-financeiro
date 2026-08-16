import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Grupo } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';

export function Grupos() {
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const lista = useQuery({ queryKey: ['grupos'], queryFn: () => api.get<Grupo[]>('/grupos') });

  const criar = useMutation({
    mutationFn: (nome: string) => api.post<Grupo>('/grupos', { nome }),
    onSuccess: async () => {
      setAberto(false);
      await clienteDeQuery.invalidateQueries({ queryKey: ['grupos'] });
    },
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    criar.mutate(String(new FormData(evento.currentTarget).get('nome')));
  };

  return (
    <>
      <TituloDaSecao
        titulo="Grupos"
        descricao="Divida as contas do rolê e feche o mês sabendo quem paga quem."
        acao={
          <Button onClick={() => setAberto(true)}>
            <Plus size={18} aria-hidden />
            Novo grupo
          </Button>
        }
      />

      {lista.isLoading && <Carregando />}
      {lista.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
      )}

      {lista.data?.length === 0 && (
        <Vazio
          titulo="Nenhum grupo ainda"
          descricao="Crie um grupo para dividir despesas com seus amigos."
          acao={<Button onClick={() => setAberto(true)}>Criar grupo</Button>}
        />
      )}

      {lista.data && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((grupo) => (
            <li key={grupo.id}>
              <Link to={`/app/grupos/${grupo.id}`}>
                <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 transition-colors hover:bg-superficie-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium text-texto">{grupo.nome}</p>
                    <p className="text-xs text-texto-suave">
                      {grupo.quantidadeDeMembros} participante(s)
                    </p>
                  </div>
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Painel aberto={aberto} aoFechar={() => setAberto(false)} titulo="Novo grupo">
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome do grupo">
            {(id) => <Input id={id} name="nome" placeholder="Amigos" required autoFocus />}
          </Campo>

          <Button type="submit" largura="cheia" disabled={criar.isPending}>
            {criar.isPending ? 'Criando…' : 'Criar'}
          </Button>
        </form>
      </Painel>
    </>
  );
}
