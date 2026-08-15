import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAutenticacao } from './auth-context';
import { Carregando } from '@/components/ui/estados';

/**
 * As rotas protegidas escondem o que a pessoa não pode ver, mas **a autorização real é
 * sempre a do backend**. Nenhuma decisão de acesso depende do cliente: quem alterar o
 * JavaScript da página consegue ver a tela, e não os dados.
 */
export function RotaProtegida() {
  const { usuario, carregando } = useAutenticacao();
  const local = useLocation();

  if (carregando) {
    return (
      <div className="p-6">
        <Carregando />
      </div>
    );
  }

  if (!usuario) {
    // Guarda de onde veio, para voltar ao destino depois do login em vez de jogar a
    // pessoa no painel e obrigá-la a navegar de novo.
    return <Navigate to="/entrar" replace state={{ destino: local.pathname }} />;
  }

  // Pendências que bloqueiam o uso: senha provisória e termos numa versão nova.
  if (usuario.precisaTrocarSenha && local.pathname !== '/app/conta') {
    return <Navigate to="/app/conta" replace state={{ motivo: 'senha' }} />;
  }

  if (usuario.precisaAceitarTermos && local.pathname !== '/app/termos') {
    return <Navigate to="/app/termos" replace />;
  }

  return <Outlet />;
}

export function RotaDeAdmin() {
  const { usuario } = useAutenticacao();

  if (usuario?.papel !== 'ADMIN') {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
