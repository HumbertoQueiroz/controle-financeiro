import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Pessoa } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input, InputDeTelefone } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';

export function Pessoas() {
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({ queryKey: ['pessoas'], queryFn: () => api.get<Pessoa[]>('/pessoas') });

  const criar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.post<Pessoa>('/pessoas', dados),
    onSuccess: async () => {
      setAberto(false);
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['pessoas'] });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete<{ anonimizada: boolean }>(`/pessoas/${id}`),
    onSuccess: () => clienteDeQuery.invalidateQueries({ queryKey: ['pessoas'] }),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    criar.mutate({
      nome: String(dados.get('nome')),
      email: String(dados.get('email') ?? '') || undefined,
      telefone: String(dados.get('telefone') ?? '') || undefined,
    });
  };

  return (
    <>
      <TituloDaSecao
        titulo="Pessoas"
        descricao="Quem participa das suas contas. Não precisam ter conta no sistema."
        acao={
          <Button onClick={() => setAberto(true)}>
            <Plus size={18} aria-hidden />
            Nova pessoa
          </Button>
        }
      />

      {lista.isLoading && <Carregando />}
      {lista.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
      )}

      {lista.data?.length === 0 && (
        <Vazio
          titulo="Nenhuma pessoa cadastrada"
          descricao="Cadastre quem participa dos seus rolês ou a quem você repassa gastos."
          acao={<Button onClick={() => setAberto(true)}>Cadastrar pessoa</Button>}
        />
      )}

      {lista.data && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((pessoa) => (
            <li key={pessoa.id}>
              <Cartao className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate font-medium text-texto">{pessoa.nome}</p>
                  {pessoa.email && (
                    <p className="truncate text-xs text-texto-suave">{pessoa.email}</p>
                  )}
                  {pessoa.usuarioId && (
                    <span className="w-fit rounded-full bg-destaque-suave px-2 py-0.5 text-xs text-destaque">
                      Tem conta no sistema
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {/* Fechamento só para terceiros: acertar contas consigo mesmo não é
                      uma operação que exista. */}
                  {pessoa.editavel && (
                    <Button
                      variante="secundaria"
                      tamanho="pequeno"
                      onClick={() => navegar(`/app/pessoas/${pessoa.id}/fechamento`)}
                    >
                      <Receipt size={16} aria-hidden />
                      Fechamento
                    </Button>
                  )}

                  {/* A própria ficha não é editável: é a identidade do usuário nas
                      obrigações, e apagá-la quebraria os saldos onde ele aparece. */}
                  {pessoa.editavel && (
                    <Button
                      variante="fantasma"
                      tamanho="icone"
                      aria-label={`Excluir ${pessoa.nome}`}
                      onClick={() => excluir.mutate(pessoa.id)}
                    >
                      <Trash size={18} aria-hidden />
                    </Button>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      <Painel
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Nova pessoa"
        descricao="O e-mail é opcional, e serve para convidá-la depois."
      >
        <form id="form-pessoa" onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">{(id) => <Input id={id} name="nome" required autoFocus />}</Campo>
          <Campo rotulo="E-mail (opcional)">
            {(id) => <Input id={id} name="email" type="email" />}
          </Campo>
          <Campo rotulo="WhatsApp (opcional)" auxilio="Só números, com DDD.">
            {(id) => <InputDeTelefone id={id} name="telefone" />}
          </Campo>

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
