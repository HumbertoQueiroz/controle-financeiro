import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAutenticacao } from '@/auth/auth-context';
import { AceiteDeTermos } from '@/components/aceite-de-termos';
import { Button } from '@/components/ui/button';
import { Cartao } from '@/components/ui/cartao';

/**
 * Pedido de aceite quando uma versão nova dos documentos é publicada.
 *
 * Bloqueia o uso do app até o aceite: continuar tratando os dados sob um documento que a
 * pessoa não aceitou é exatamente o que a LGPD não permite.
 */
export function AceitarTermos() {
  const navegar = useNavigate();
  const { recarregar } = useAutenticacao();

  const aceitar = useMutation({
    mutationFn: () => api.post('/auth/aceitar-termos'),
    onSuccess: async () => {
      await recarregar();
      navegar('/app', { replace: true });
    },
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold text-texto">Atualizamos nossos documentos</h1>
          <p className="text-sm text-texto-suave">
            Leia e aceite para continuar usando o Controle Financeiro.
          </p>
        </div>

        <Cartao className="p-5">
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              aceitar.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <AceiteDeTermos />

            <Button type="submit" largura="cheia" disabled={aceitar.isPending}>
              {aceitar.isPending ? 'Registrando…' : 'Aceitar e continuar'}
            </Button>
          </form>
        </Cartao>
      </div>
    </main>
  );
}
