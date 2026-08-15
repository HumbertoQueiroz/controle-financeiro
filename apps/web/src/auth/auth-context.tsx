import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { UsuarioAutenticado } from '@controle/shared';
import { api, ApiError } from '@/lib/api';

interface Contexto {
  usuario: UsuarioAutenticado | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<UsuarioAutenticado>;
  sair: () => Promise<void>;
  recarregar: () => Promise<unknown>;
}

const AuthContext = createContext<Contexto | null>(null);

export function ProvedorDeAutenticacao({ children }: { children: ReactNode }) {
  const clienteDeQuery = useQueryClient();

  const sessao = useQuery({
    queryKey: ['sessao'],
    queryFn: async () => {
      try {
        return await api.get<UsuarioAutenticado>('/auth/eu');
      } catch (erro) {
        // 401 aqui não é falha: é a resposta correta para quem não está logado, e tratá-la
        // como erro faria a tela de login piscar um aviso vermelho a cada visita.
        if (erro instanceof ApiError && erro.status === 401) return null;
        throw erro;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const valor: Contexto = {
    usuario: sessao.data ?? null,
    carregando: sessao.isLoading,

    entrar: async (email, senha) => {
      const usuario = await api.post<UsuarioAutenticado>('/auth/login', { email, senha });
      clienteDeQuery.setQueryData(['sessao'], usuario);

      return usuario;
    },

    sair: async () => {
      await api.post('/auth/logout');
      // Limpa tudo, não só a sessão: as listas em cache são dados de quem estava logado, e
      // deixá-las faria a próxima pessoa ver por um instante o que não é dela.
      clienteDeQuery.clear();
      clienteDeQuery.setQueryData(['sessao'], null);
    },

    recarregar: () => clienteDeQuery.invalidateQueries({ queryKey: ['sessao'] }),
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAutenticacao() {
  const contexto = useContext(AuthContext);

  if (!contexto) throw new Error('useAutenticacao precisa estar dentro de ProvedorDeAutenticacao');

  return contexto;
}
