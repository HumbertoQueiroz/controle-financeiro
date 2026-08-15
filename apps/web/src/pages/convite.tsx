import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROTULO_DO_ESCOPO, type ConvitePublico, type UsuarioAutenticado } from '@controle/shared';
import { api } from '@/lib/api';
import { AceiteDeTermos } from '@/components/aceite-de-termos';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao } from '@/components/ui/cartao';
import { Carregando, Erro } from '@/components/ui/estados';

/**
 * Página pública do convite.
 *
 * Não é indexada e não vaza o token: o `noindex` é injetado aqui e a API responde
 * `Referrer-Policy: no-referrer`, senão o token — que está no caminho da URL — iria no
 * cabeçalho `Referer` de qualquer recurso externo que a página carregasse.
 */
export function Convite() {
  const { token = '' } = useParams();
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const convite = useQuery({
    queryKey: ['convite', token],
    queryFn: () => api.get<ConvitePublico>(`/convite/${token}`),
    retry: false,
  });

  const aceitar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post<UsuarioAutenticado>(`/convite/${token}/aceitar`, dados),
    onSuccess: (usuario) => {
      clienteDeQuery.setQueryData(['sessao'], usuario);
      // Entra direto: a pessoa acabou de provar quem é abrindo um link que só ela recebeu,
      // e pedir login logo depois do cadastro é atrito sem ganho.
      navegar('/app', { replace: true });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    aceitar.mutate({
      nome: String(dados.get('nome')),
      senha: String(dados.get('senha')),
      aceitaTermos: dados.get('aceitaTermos') === 'on',
      aceitaPrivacidade: dados.get('aceitaPrivacidade') === 'on',
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {convite.isLoading && <Carregando linhas={2} />}

        {convite.isError && (
          <Erro mensagem="Este convite é inválido ou já expirou. Peça um link novo a quem convidou você." />
        )}

        {convite.data && (
          <>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-xl font-semibold text-texto">
                {convite.data.convidadoPor} compartilhou com você
              </h1>
              {/* O que será compartilhado aparece ANTES do cadastro: consentir sem saber
                  a que não é consentir. */}
              <p className="text-sm text-texto-suave">
                Você poderá ver:{' '}
                <strong>{ROTULO_DO_ESCOPO[convite.data.escopo].toLowerCase()}</strong>
              </p>
            </div>

            <Cartao className="p-5">
              <form onSubmit={aoEnviar} className="flex flex-col gap-4">
                <Campo rotulo="E-mail" auxilio="Definido pelo convite e não pode ser alterado.">
                  {(id) => (
                    // Travado no e-mail convidado: aceitar outro transformaria um link
                    // encaminhado no WhatsApp em acesso transferível a dado financeiro.
                    <Input id={id} value={convite.data.email} readOnly disabled />
                  )}
                </Campo>

                {convite.data.jaTemConta ? (
                  <p className="text-sm text-texto-suave">
                    Já existe uma conta com este e-mail. Informe a senha dela para aceitar.
                  </p>
                ) : null}

                <Campo rotulo="Seu nome">
                  {(id) => <Input id={id} name="nome" autoComplete="name" required autoFocus />}
                </Campo>

                <Campo
                  rotulo={convite.data.jaTemConta ? 'Sua senha' : 'Crie uma senha'}
                  auxilio={convite.data.jaTemConta ? undefined : 'Pelo menos 8 caracteres'}
                >
                  {(id) => (
                    <Input
                      id={id}
                      name="senha"
                      type="password"
                      autoComplete={convite.data.jaTemConta ? 'current-password' : 'new-password'}
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

                <Button type="submit" largura="cheia" disabled={aceitar.isPending}>
                  {aceitar.isPending ? 'Aceitando…' : 'Aceitar convite'}
                </Button>
              </form>
            </Cartao>
          </>
        )}
      </div>
    </main>
  );
}
