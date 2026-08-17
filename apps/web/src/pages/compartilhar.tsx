import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Trash, WhatsappLogo } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import {
  ROTULO_DO_ESCOPO,
  type Compartilhamento,
  type Escopo,
  type Pessoa,
  type ResultadoDoCompartilhamento,
} from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, InputDeTelefone, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';

type ConviteCriado = Extract<ResultadoDoCompartilhamento, { status: 'INVITE_CREATED' }>;

export function Compartilhar() {
  const clienteDeQuery = useQueryClient();
  const [conviteCriado, setConviteCriado] = useState<ConviteCriado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['compartilhamentos'],
    queryFn: () => api.get<Compartilhamento[]>('/compartilhamentos'),
  });

  const pessoas = useQuery({ queryKey: ['pessoas'], queryFn: () => api.get<Pessoa[]>('/pessoas') });

  // Só quem ainda não tem conta pode ser vinculado por um convite: quem já tem recebe o
  // acesso direto, e o vínculo daquela ficha é assunto separado.
  const pessoasSemConta =
    pessoas.data?.filter((pessoa) => pessoa.editavel && !pessoa.usuarioId) ?? [];

  const compartilhar = useMutation({
    mutationFn: (dados: { email: string; escopo: Escopo; telefone?: string }) =>
      api.post<ResultadoDoCompartilhamento>('/compartilhamentos', dados),
    onSuccess: async (resultado) => {
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['compartilhamentos'] });

      if (resultado.status === 'INVITE_CREATED') {
        // Copia antes de abrir o diálogo. A cópia automática é conveniência: o diálogo
        // mostra o link num campo copiável de qualquer forma, porque em alguns navegadores
        // o gesto do clique "expira" durante a espera da requisição e a cópia falha.
        await navigator.clipboard?.writeText(resultado.urlDoConvite).catch(() => undefined);
        setConviteCriado(resultado);
      }
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const revogar = useMutation({
    mutationFn: (item: Compartilhamento) =>
      api.delete(item.tipo === 'GRANT' ? `/compartilhamentos/${item.id}` : `/convites/${item.id}`),
    onSuccess: () => clienteDeQuery.invalidateQueries({ queryKey: ['compartilhamentos'] }),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const dados = new FormData(evento.currentTarget);
    const telefone = String(dados.get('telefone') ?? '').trim();
    const pessoaId = String(dados.get('pessoaId') ?? '').trim();

    compartilhar.mutate({
      email: String(dados.get('email')),
      escopo: String(dados.get('escopo')) as Escopo,
      ...(telefone ? { telefone } : {}),
      // O vínculo com a ficha é o que faz o convidado enxergar as dívidas já lançadas em
      // nome dele. Sem ele, o convidado entra e vê uma tela vazia.
      ...(pessoaId ? { pessoaId } : {}),
    });

    evento.currentTarget.reset();
  };

  return (
    <>
      <TituloDaSecao
        titulo="Compartilhar meus relatórios"
        descricao="Só você decide quem vê. O acesso pode ser retirado a qualquer momento."
      />

      <Cartao className="p-5">
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="O que a pessoa poderá ver">
            {(id) => (
              <Select id={id} name="escopo" defaultValue="BOTH">
                {Object.entries(ROTULO_DO_ESCOPO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo
            rotulo="E-mail da pessoa"
            auxilio="Se ela ainda não tiver conta, geramos um convite para você enviar."
          >
            {(id) => <Input id={id} name="email" type="email" inputMode="email" required />}
          </Campo>

          <Campo
            rotulo="WhatsApp (opcional)"
            auxilio="Só números, com DDD. Sem isso, você escolhe o contato no app."
          >
            {(id) => <InputDeTelefone id={id} name="telefone" />}
          </Campo>

          <Campo
            rotulo="É alguém da sua lista? (opcional)"
            auxilio="Ao aceitar, essa pessoa passa a ver as contas já lançadas no nome dela."
          >
            {(id) => (
              <Select id={id} name="pessoaId" defaultValue="">
                <option value="">Não vincular a ninguém</option>
                {pessoasSemConta.map((pessoa) => (
                  <option key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={compartilhar.isPending}>
            {compartilhar.isPending ? 'Compartilhando…' : 'Compartilhar'}
          </Button>
        </form>
      </Cartao>

      <section className="flex flex-col gap-3">
        <TituloDaSecao titulo="Quem tem acesso" />

        {lista.isLoading && <Carregando />}
        {lista.isError && (
          <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lista.refetch()} />
        )}

        {lista.data?.length === 0 && (
          <Vazio
            titulo="Ninguém vê seus relatórios"
            descricao="Compartilhe acima para dar acesso a alguém."
          />
        )}

        {lista.data && lista.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lista.data.map((item) => (
              <li key={item.id}>
                <Cartao className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-texto">{item.nome ?? item.email}</p>
                    <p className="truncate text-xs text-texto-suave">{item.email}</p>
                    <p className="text-xs text-texto-suave">{ROTULO_DO_ESCOPO[item.escopo]}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Convite pendente é acesso futuro, e precisa aparecer como tal —
                        escondê-lo faria o dono achar que compartilhou com menos gente. */}
                    {item.tipo === 'CONVITE' && (
                      <span className="rounded-full bg-superficie-2 px-2 py-1 text-xs text-texto-suave">
                        Convite pendente
                        {item.expiraEm && ` · expira ${formatarData(item.expiraEm)}`}
                      </span>
                    )}

                    <Button
                      variante="fantasma"
                      tamanho="icone"
                      aria-label={`Retirar acesso de ${item.nome ?? item.email}`}
                      onClick={() => revogar.mutate(item)}
                    >
                      <Trash size={18} aria-hidden />
                    </Button>
                  </div>
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DialogoDoConvite convite={conviteCriado} aoFechar={() => setConviteCriado(null)} />
    </>
  );
}

/**
 * O que aparece assim que um convite é criado.
 *
 * O sistema não envia nada por conta própria: o link é copiado e a entrega fica com o dono,
 * pelo canal que ele já usa. Mandar mensagem para terceiros como efeito colateral de uma
 * busca é o tipo de coisa que fica ruim quando alguém digita o e-mail errado.
 */
function DialogoDoConvite({
  convite,
  aoFechar,
}: {
  convite: ConviteCriado | null;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard?.writeText(convite?.urlDoConvite ?? '');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Painel
      aberto={Boolean(convite)}
      aoFechar={aoFechar}
      titulo="Link copiado"
      descricao={`Envie para ${convite?.email}. O link vale uma vez só e expira em 7 dias.`}
      rodape={
        <>
          <Button variante="secundaria" onClick={aoFechar}>
            Sair
          </Button>

          <a
            href={convite?.urlDoWhatsApp}
            target="_blank"
            rel="noreferrer"
            onClick={aoFechar}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-padrao bg-destaque px-4 text-sm font-medium text-destaque-texto transition-opacity hover:opacity-90 active:opacity-80"
          >
            <WhatsappLogo size={20} weight="fill" aria-hidden />
            Enviar por WhatsApp
          </a>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="link-do-convite" className="text-sm font-medium text-texto">
          Link do convite
        </label>

        <div className="flex items-center gap-2">
          {/* Campo copiável é o caminho garantido: a cópia automática depende de gesto do
              usuário e de contexto seguro, e falha em alguns navegadores. */}
          <input
            id="link-do-convite"
            readOnly
            value={convite?.urlDoConvite ?? ''}
            onFocus={(evento) => evento.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-padrao border border-borda bg-superficie-2 px-3 text-sm text-texto"
          />

          <Button variante="secundaria" tamanho="icone" aria-label="Copiar link" onClick={copiar}>
            {copiado ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          </Button>
        </div>

        <p className="text-xs text-texto-suave">
          Trate o link como uma senha: quem o receber poderá se cadastrar com o e-mail convidado e
          ver o que você autorizou.
        </p>
      </div>
    </Painel>
  );
}
