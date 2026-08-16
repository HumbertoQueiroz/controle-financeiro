import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { UsuarioAutenticado } from '@controle/shared';
import { api } from '@/lib/api';
import { AceiteDeTermos } from '@/components/aceite-de-termos';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao } from '@/components/ui/cartao';

export function Cadastro() {
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aoEnviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const dados = new FormData(evento.currentTarget);

    try {
      const usuario = await api.post<UsuarioAutenticado>('/auth/cadastro', {
        nome: String(dados.get('nome')),
        email: String(dados.get('email')),
        senha: String(dados.get('senha')),
        aceitaTermos: dados.get('aceitaTermos') === 'on',
        aceitaPrivacidade: dados.get('aceitaPrivacidade') === 'on',
      });

      clienteDeQuery.setQueryData(['sessao'], usuario);
      navegar('/app', { replace: true });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar a conta');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-xl font-semibold text-texto">Criar conta</h1>

        <Cartao className="p-5">
          <form onSubmit={aoEnviar} className="flex flex-col gap-4">
            <Campo rotulo="Nome">
              {(id) => <Input id={id} name="nome" autoComplete="name" required autoFocus />}
            </Campo>

            <Campo rotulo="E-mail">
              {(id) => <Input id={id} name="email" type="email" autoComplete="email" required />}
            </Campo>

            <Campo rotulo="Senha" auxilio="Pelo menos 8 caracteres">
              {(id) => (
                <Input
                  id={id}
                  name="senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              )}
            </Campo>

            <AceiteDeTermos />

            {erro && (
              <p role="alert" className="text-sm text-negativo">
                {erro}
              </p>
            )}

            <Button type="submit" largura="cheia" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar conta'}
            </Button>
          </form>
        </Cartao>

        <p className="text-center text-sm text-texto-suave">
          Já tem conta?{' '}
          <Link
            to="/entrar"
            className="font-medium text-destaque underline transition-opacity hover:opacity-80"
          >
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
