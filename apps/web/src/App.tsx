import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorDeAutenticacao } from '@/auth/auth-context';
import { RotaDeAdmin, RotaProtegida } from '@/auth/rotas-protegidas';
import { ProvedorDeTema } from '@/lib/tema';
import { AppShell } from '@/components/app-shell';
import { Carregando } from '@/components/ui/estados';
import { Entrar } from '@/pages/entrar';

/**
 * As rotas do app são carregadas sob demanda.
 *
 * A tela de login e a de convite são o primeiro contato de quem chega, e não devem baixar
 * o bundle inteiro do aplicativo autenticado para aparecer.
 */
const Cadastro = lazy(() => import('@/pages/cadastro').then((m) => ({ default: m.Cadastro })));
const Convite = lazy(() => import('@/pages/convite').then((m) => ({ default: m.Convite })));
const Painel = lazy(() => import('@/pages/painel').then((m) => ({ default: m.Painel })));
const Cartoes = lazy(() => import('@/pages/cartoes').then((m) => ({ default: m.Cartoes })));
const DetalheDoCartao = lazy(() =>
  import('@/pages/cartao').then((m) => ({ default: m.DetalheDoCartao })),
);
const DetalheDaFatura = lazy(() =>
  import('@/pages/fatura').then((m) => ({ default: m.DetalheDaFatura })),
);
const Grupos = lazy(() => import('@/pages/grupos').then((m) => ({ default: m.Grupos })));
const DetalheDoGrupo = lazy(() =>
  import('@/pages/grupo').then((m) => ({ default: m.DetalheDoGrupo })),
);
const DetalheDoRole = lazy(() =>
  import('@/pages/role').then((m) => ({ default: m.DetalheDoRole })),
);
const Pessoas = lazy(() => import('@/pages/pessoas').then((m) => ({ default: m.Pessoas })));
const Compartilhar = lazy(() =>
  import('@/pages/compartilhar').then((m) => ({ default: m.Compartilhar })),
);
const Relatorios = lazy(() =>
  import('@/pages/relatorios').then((m) => ({ default: m.Relatorios })),
);
const Conta = lazy(() => import('@/pages/conta').then((m) => ({ default: m.Conta })));
const AceitarTermos = lazy(() =>
  import('@/pages/aceitar-termos').then((m) => ({ default: m.AceitarTermos })),
);
const AdminUsuarios = lazy(() =>
  import('@/pages/admin-usuarios').then((m) => ({ default: m.AdminUsuarios })),
);

const clienteDeQuery = new QueryClient({
  defaultOptions: {
    queries: {
      // Erro de permissão e de registro inexistente não melhora com nova tentativa: só
      // atrasa a mensagem que o usuário precisa ler.
      retry: (tentativas, erro) => {
        const status = (erro as { status?: number }).status;

        if (status && status >= 400 && status < 500) return false;

        return tentativas < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={clienteDeQuery}>
      <ProvedorDeTema>
        <BrowserRouter>
          <ProvedorDeAutenticacao>
            <Suspense
              fallback={
                <div className="p-6">
                  <Carregando />
                </div>
              }
            >
              <Routes>
                <Route path="/entrar" element={<Entrar />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/convite/:token" element={<Convite />} />

                <Route element={<RotaProtegida />}>
                  <Route path="/app/termos" element={<AceitarTermos />} />

                  <Route path="/app" element={<AppShell />}>
                    <Route index element={<Painel />} />
                    <Route path="cartoes" element={<Cartoes />} />
                    <Route path="cartoes/:id" element={<DetalheDoCartao />} />
                    <Route path="faturas/:id" element={<DetalheDaFatura />} />
                    <Route path="grupos" element={<Grupos />} />
                    <Route path="grupos/:id" element={<DetalheDoGrupo />} />
                    <Route path="roles/:id" element={<DetalheDoRole />} />
                    <Route path="pessoas" element={<Pessoas />} />
                    <Route path="compartilhar" element={<Compartilhar />} />
                    <Route path="relatorios" element={<Relatorios />} />
                    <Route path="conta" element={<Conta />} />

                    <Route element={<RotaDeAdmin />}>
                      <Route path="admin/usuarios" element={<AdminUsuarios />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </Suspense>
          </ProvedorDeAutenticacao>
        </BrowserRouter>
      </ProvedorDeTema>
    </QueryClientProvider>
  );
}
