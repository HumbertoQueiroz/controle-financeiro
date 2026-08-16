import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAutenticacao } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Painel } from '@/components/ui/painel';

export function Conta() {
  const { usuario, recarregar, sair } = useAutenticacao();
  const navegar = useNavigate();
  const local = useLocation();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const precisaTrocar =
    usuario?.precisaTrocarSenha || (local.state as { motivo?: string })?.motivo === 'senha';

  const trocarSenha = useMutation({
    mutationFn: (dados: { senhaAtual: string; novaSenha: string }) =>
      api.post('/auth/trocar-senha', dados),
    onSuccess: async () => {
      setErro(null);
      setMensagem('Senha alterada.');
      await recarregar();
    },
    onError: (falha) => {
      setMensagem(null);
      setErro(falha instanceof Error ? falha.message : 'Não foi possível trocar a senha');
    },
  });

  const excluir = useMutation({
    mutationFn: () => api.delete('/eu'),
    onSuccess: async () => {
      await sair();
      navegar('/entrar', { replace: true });
    },
    onError: (falha) =>
      setErro(falha instanceof Error ? falha.message : 'Não foi possível excluir'),
  });

  const aoTrocar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    trocarSenha.mutate({
      senhaAtual: String(dados.get('senhaAtual')),
      novaSenha: String(dados.get('novaSenha')),
    });
  };

  return (
    <>
      <TituloDaSecao titulo="Minha conta" descricao={usuario?.email} />

      {precisaTrocar && (
        <Cartao className="border-atencao/40 bg-superficie-2 p-4">
          <p className="text-sm text-texto">
            Sua senha foi definida por outra pessoa. Escolha uma nova para continuar.
          </p>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-texto">Trocar senha</h2>

        <form onSubmit={aoTrocar} className="flex flex-col gap-4">
          <Campo rotulo="Senha atual">
            {(id) => (
              <Input
                id={id}
                name="senhaAtual"
                type="password"
                autoComplete="current-password"
                required
              />
            )}
          </Campo>

          <Campo rotulo="Nova senha" auxilio="Pelo menos 8 caracteres">
            {(id) => (
              <Input
                id={id}
                name="novaSenha"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            )}
          </Campo>

          {mensagem && <p className="text-sm text-positivo">{mensagem}</p>}
          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" disabled={trocarSenha.isPending}>
            {trocarSenha.isPending ? 'Salvando…' : 'Trocar senha'}
          </Button>
        </form>
      </Cartao>

      <Cartao className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-texto">Meus dados</h2>
          <p className="text-sm text-texto-suave">
            Baixe tudo que guardamos sobre você, em arquivo. É o seu direito de acesso e
            portabilidade.
          </p>
        </div>

        {/* Link direto: a rota devolve Content-Disposition e o navegador salva o arquivo. */}
        <a
          href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3333'}/eu/dados`}
          className="inline-flex min-h-11 w-fit items-center rounded-padrao border border-borda px-4 text-sm font-medium text-texto hover:bg-superficie-2"
        >
          Baixar meus dados
        </a>
      </Cartao>

      <Cartao className="flex flex-col gap-4 border-negativo/30 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-texto">Excluir minha conta</h2>
          <p className="text-sm text-texto-suave">
            Seus dados pessoais são removidos e o acesso é encerrado. Os valores que você deve ou
            tem a receber permanecem, porque são também de outras pessoas.
          </p>
        </div>

        <Button
          variante="destrutiva"
          className="w-fit"
          onClick={() => setConfirmandoExclusao(true)}
        >
          Excluir conta
        </Button>
      </Cartao>

      <Painel
        aberto={confirmandoExclusao}
        aoFechar={() => setConfirmandoExclusao(false)}
        titulo="Excluir sua conta?"
        // Ação irreversível: o texto diz exatamente o que acontece, inclusive o que NÃO
        // é apagado, para a pessoa não descobrir depois.
        descricao="Seu nome, e-mail e telefone serão removidos, o login será desativado e todos os compartilhamentos serão revogados. Os valores das dívidas permanecem, sem identificar você. Isso não pode ser desfeito."
        rodape={
          <>
            <Button variante="secundaria" onClick={() => setConfirmandoExclusao(false)}>
              Cancelar
            </Button>
            <Button
              variante="destrutiva"
              onClick={() => excluir.mutate()}
              disabled={excluir.isPending}
            >
              {excluir.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
            </Button>
          </>
        }
      >
        {excluir.isError && (
          <p role="alert" className="text-sm text-negativo">
            {excluir.error instanceof Error ? excluir.error.message : 'Não foi possível'}
          </p>
        )}
      </Painel>
    </>
  );
}
