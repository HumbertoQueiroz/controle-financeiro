import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAutenticacao } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao } from '@/components/ui/cartao';

export function Entrar() {
  const { usuario, entrar } = useAutenticacao();
  const navegar = useNavigate();
  const local = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) {
    return <Navigate to="/app" replace />;
  }

  const aoEnviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const dados = new FormData(evento.currentTarget);

    try {
      await entrar(String(dados.get('email')), String(dados.get('senha')));
      const destino = (local.state as { destino?: string } | null)?.destino;
      navegar(destino ?? '/app', { replace: true });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold text-texto">Controle Financeiro</h1>
          <p className="text-sm text-texto-suave">Entre para ver suas contas</p>
        </div>

        <Cartao className="p-5">
          <form onSubmit={aoEnviar} className="flex flex-col gap-4">
            <Campo rotulo="E-mail">
              {(id) => (
                <Input
                  id={id}
                  name="email"
                  type="email"
                  autoComplete="email"
                  // inputMode e autoComplete corretos poupam digitação no celular, que é
                  // onde a maioria dos logins acontece.
                  inputMode="email"
                  required
                  autoFocus
                />
              )}
            </Campo>

            <Campo rotulo="Senha">
              {(id) => (
                <Input
                  id={id}
                  name="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </Campo>

            {erro && (
              <p role="alert" className="text-sm text-negativo">
                {erro}
              </p>
            )}

            <Button type="submit" largura="cheia" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Cartao>

        <p className="text-center text-sm text-texto-suave">
          Não tem conta?{' '}
          <Link
            to="/cadastro"
            className="font-medium text-destaque underline transition-opacity hover:opacity-80"
          >
            Cadastre-se
          </Link>
        </p>
      </div>
    </main>
  );
}
