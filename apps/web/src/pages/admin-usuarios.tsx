import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { Usuario } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { useAutenticacao } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { CampoDeSenha } from '@/components/ui/campo-de-senha';
import { TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro } from '@/components/ui/estados';
import { ListaDeDados, type ColunaDaLista } from '@/components/ui/lista-de-dados';
import { Painel } from '@/components/ui/painel';

export function AdminUsuarios() {
  const { usuario: eu } = useAutenticacao();
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>('/usuarios'),
  });

  const criar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.post<Usuario>('/usuarios', dados),
    onSuccess: async () => {
      setAberto(false);
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, ...dados }: { id: string } & Record<string, unknown>) =>
      api.patch(`/usuarios/${id}`, dados),
    onSuccess: () => clienteDeQuery.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const colunas: ColunaDaLista<Usuario>[] = [
    { chave: 'nome', titulo: 'Nome', principal: true, render: (item) => item.nome },
    { chave: 'email', titulo: 'E-mail', render: (item) => item.email },
    {
      chave: 'papel',
      titulo: 'Papel',
      render: (item) => (
        <Select
          aria-label={`Papel de ${item.nome}`}
          value={item.papel}
          // O backend recusa o admin rebaixar a si mesmo; desabilitar aqui evita oferecer
          // uma ação que vai falhar.
          disabled={item.id === eu?.id}
          onChange={(evento) => atualizar.mutate({ id: item.id, papel: evento.target.value })}
          className="text-xs"
        >
          <option value="USER">Usuário</option>
          <option value="ADMIN">Administrador</option>
        </Select>
      ),
    },
    {
      chave: 'ativo',
      titulo: 'Situação',
      render: (item) =>
        item.id === eu?.id ? (
          <span className="text-xs text-texto-suave">Você</span>
        ) : (
          <Button
            variante="secundaria"
            tamanho="pequeno"
            onClick={() => atualizar.mutate({ id: item.id, ativo: !item.ativo })}
          >
            {item.ativo ? 'Desativar' : 'Ativar'}
          </Button>
        ),
    },
    {
      chave: 'criadoEm',
      titulo: 'Criado em',
      ocultarNoCelular: true,
      render: (item) => formatarData(item.criadoEm),
    },
  ];

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    criar.mutate({
      nome: String(dados.get('nome')),
      email: String(dados.get('email')),
      senha: String(dados.get('senha')),
      papel: String(dados.get('papel')),
    });
  };

  return (
    <>
      <TituloDaSecao
        titulo="Usuários"
        descricao="Administradores enxergam os dados de todos."
        acao={
          <Button onClick={() => setAberto(true)}>
            <Plus size={18} aria-hidden />
            Novo usuário
          </Button>
        }
      />

      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}

      {lista.isLoading && <Carregando />}
      {lista.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
      )}

      {lista.data && (
        <ListaDeDados itens={lista.data} colunas={colunas} chaveDoItem={(item) => item.id} />
      )}

      <Painel
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Novo usuário"
        descricao="A pessoa será obrigada a trocar a senha no primeiro acesso."
      >
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">{(id) => <Input id={id} name="nome" required autoFocus />}</Campo>
          <Campo rotulo="E-mail">
            {(id) => <Input id={id} name="email" type="email" required />}
          </Campo>
          <CampoDeSenha rotulo="Senha provisória" name="senha" required />
          <Campo rotulo="Papel">
            {(id) => (
              <Select id={id} name="papel" defaultValue="USER">
                <option value="USER">Usuário</option>
                <option value="ADMIN">Administrador</option>
              </Select>
            )}
          </Campo>

          <Button type="submit" largura="cheia" disabled={criar.isPending}>
            {criar.isPending ? 'Criando…' : 'Criar'}
          </Button>
        </form>
      </Painel>
    </>
  );
}
