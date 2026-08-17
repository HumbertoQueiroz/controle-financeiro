import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorDeAutenticacao } from '@/auth/auth-context';
import { RotaDeAdmin, RotaProtegida } from '@/auth/rotas-protegidas';
import { ProvedorDeTema } from '@/lib/tema';
import { AppShell } from '@/components/app-shell';
import { Carregando } from '@/components/ui/estados';
import { Entrar } from '@/pages/entrar';
import { Landing } from '@/publico/landing';
import { DocumentoLegal } from '@/publico/documento-legal';
import { MetadadosDaRota } from '@/publico/metadados-da-rota';

/**
 * As rotas do app são carregadas sob demanda.
 *
 * A tela de login e a de convite são o primeiro contato de quem chega, e não devem baixar
 * o bundle inteiro do aplicativo autenticado para aparecer.
 */
const Cadastro = lazy(() => import('@/pages/cadastro').then((m) => ({ default: m.Cadastro })));
const Convite = lazy(() => import('@/pages/convite').then((m) => ({ default: m.Convite })));
const Dashboard = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.Dashboard })));
const Orcamento = lazy(() => import('@/pages/orcamento').then((m) => ({ default: m.Orcamento })));
const ContasAReceber = lazy(() =>
  import('@/pages/contas').then((m) => ({ default: m.ContasAReceber })),
);
const ContasAPagar = lazy(() =>
  import('@/pages/contas').then((m) => ({ default: m.ContasAPagar })),
);
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
const Participantes = lazy(() =>
  import('@/pages/participantes').then((m) => ({ default: m.Participantes })),
);
const Pessoas = lazy(() => import('@/pages/pessoas').then((m) => ({ default: m.Pessoas })));
const Fechamento = lazy(() =>
  import('@/pages/fechamento').then((m) => ({ default: m.Fechamento })),
);
const Categorias = lazy(() =>
  import('@/pages/categorias').then((m) => ({ default: m.Categorias })),
);
const Classificar = lazy(() =>
  import('@/pages/classificar').then((m) => ({ default: m.Classificar })),
);
const ContasBancarias = lazy(() =>
  import('@/pages/contas-bancarias').then((m) => ({ default: m.ContasBancarias })),
);
const Recorrencias = lazy(() =>
  import('@/pages/recorrencias').then((m) => ({ default: m.Recorrencias })),
);
const HistoricoDeFechamentos = lazy(() =>
  import('@/pages/historico-de-fechamentos').then((m) => ({ default: m.HistoricoDeFechamentos })),
);
const Mais = lazy(() => import('@/pages/mais').then((m) => ({ default: m.Mais })));
const Parcelamentos = lazy(() =>
  import('@/pages/parcelamentos').then((m) => ({ default: m.Parcelamentos })),
);
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
          <MetadadosDaRota />
          <ProvedorDeAutenticacao>
            <Suspense
              fallback={
                <div className="p-6">
                  <Carregando />
                </div>
              }
            >
              <Routes>
                {/* Superfície pública: pré-renderizada no build e indexável. */}
                <Route path="/" element={<Landing />} />
                <Route path="/termos" element={<DocumentoLegal documento="termos" />} />
                <Route path="/privacidade" element={<DocumentoLegal documento="privacidade" />} />

                <Route path="/entrar" element={<Entrar />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/convite/:token" element={<Convite />} />

                <Route element={<RotaProtegida />}>
                  <Route path="/app/termos" element={<AceitarTermos />} />

                  <Route path="/app" element={<AppShell />}>
                    {/* O orçamento do mês é a primeira pergunta de quem abre o app. */}
                    <Route index element={<Dashboard />} />
                    <Route path="orcamento" element={<Orcamento />} />
                    <Route path="a-receber" element={<ContasAReceber />} />
                    <Route path="a-pagar" element={<ContasAPagar />} />
                    <Route path="cartoes" element={<Cartoes />} />
                    <Route path="cartoes/:id" element={<DetalheDoCartao />} />
                    <Route path="faturas/:id" element={<DetalheDaFatura />} />
                    <Route path="parcelamentos" element={<Parcelamentos />} />
                    <Route path="grupos" element={<Grupos />} />
                    <Route path="grupos/:id" element={<DetalheDoGrupo />} />
                    <Route path="roles/:id" element={<DetalheDoRole />} />
                    <Route path="participantes" element={<Participantes />} />
                    <Route path="pessoas" element={<Pessoas />} />
                    <Route path="pessoas/:id/fechamento" element={<Fechamento />} />
                    <Route path="categorias" element={<Categorias />} />
                    <Route path="classificar" element={<Classificar />} />
                    <Route path="contas" element={<ContasBancarias />} />
                    <Route path="recorrentes" element={<Recorrencias />} />
                    <Route path="fechamentos" element={<HistoricoDeFechamentos />} />
                    <Route path="mais" element={<Mais />} />
                    <Route path="compartilhar" element={<Compartilhar />} />
                    <Route path="relatorios" element={<Relatorios />} />
                    <Route path="conta" element={<Conta />} />

                    <Route element={<RotaDeAdmin />}>
                      <Route path="admin/usuarios" element={<AdminUsuarios />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </Suspense>
          </ProvedorDeAutenticacao>
        </BrowserRouter>
      </ProvedorDeTema>
    </QueryClientProvider>
  );
}
