import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, PencilSimple, Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { ContaBancaria, ResumoDeContas } from '@controle/shared';
import { ROTULO_DO_TIPO_DE_CONTA, formatarValor, tipoDeContaSchema } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

type EmEdicao = ContaBancaria | 'nova' | null;

export function ContasBancarias() {
  const clienteDeQuery = useQueryClient();
  const [emEdicao, setEmEdicao] = useState<EmEdicao>(null);
  const [erro, setErro] = useState<string | null>(null);

  const resumo = useQuery({
    queryKey: ['contas'],
    queryFn: () => api.get<ResumoDeContas>('/contas'),
  });

  const editando = emEdicao !== null && emEdicao !== 'nova' ? emEdicao : null;

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      editando ? api.patch(`/contas/${editando.id}`, dados) : api.post('/contas', dados),
    onSuccess: async () => {
      setEmEdicao(null);
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['contas'] });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const arquivar = useMutation({
    mutationFn: (id: string) => api.patch(`/contas/${id}`, { arquivada: true }),
    onSuccess: () => clienteDeQuery.invalidateQueries({ queryKey: ['contas'] }),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const campos = new FormData(evento.currentTarget);

    salvar.mutate({
      nome: String(campos.get('nome')),
      tipo: String(campos.get('tipo')),
      saldoInicial: String(campos.get('saldoInicial') ?? '0') || '0',
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TituloDaSecao
        titulo="Contas"
        descricao="Onde o dinheiro fica. O saldo sai do inicial mais as baixas registradas em cada conta."
        acao={
          <Button onClick={() => setEmEdicao('nova')}>
            <Plus size={18} aria-hidden />
            Nova conta
          </Button>
        }
      />

      {resumo.isLoading && <Carregando />}
      {resumo.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => resumo.refetch()} />
      )}

      {resumo.data?.contas.length === 0 && (
        <Vazio
          titulo="Nenhuma conta cadastrada"
          descricao="Sem conta, o sistema sabe o que você deve mas não quanto você tem."
          acao={<Button onClick={() => setEmEdicao('nova')}>Cadastrar conta</Button>}
        />
      )}

      {resumo.data && resumo.data.contas.length > 0 && (
        <>
          <Cartao className="flex items-center justify-between gap-3 p-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-texto">Total</span>
              <span className="text-xs text-texto-suave">A soma das contas em uso</span>
            </div>

            <Valor valor={resumo.data.total} tom="automatico" />
          </Cartao>

          <ul className="flex flex-col gap-2">
            {resumo.data.contas.map((conta) => (
              <li key={conta.id}>
                <Cartao className="flex min-h-14 items-center gap-2 p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-texto">{conta.nome}</span>
                    <span className="text-xs text-texto-suave">
                      {ROTULO_DO_TIPO_DE_CONTA[conta.tipo]}
                      {/* Entradas e saídas ao lado do saldo: um saldo sozinho não conta
                          se ele veio de muito movimento ou de nenhum. */}
                      {' · '}
                      entrou {formatarValor(conta.entradas)} · saiu {formatarValor(conta.saidas)}
                    </span>
                  </div>

                  <Valor valor={conta.saldo} tom="automatico" />

                  <Button
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Editar ${conta.nome}`}
                    onClick={() => {
                      setErro(null);
                      setEmEdicao(conta);
                    }}
                  >
                    <PencilSimple size={18} aria-hidden />
                  </Button>

                  <Button
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Arquivar ${conta.nome}`}
                    onClick={() => arquivar.mutate(conta.id)}
                  >
                    <Archive size={18} aria-hidden />
                  </Button>
                </Cartao>
              </li>
            ))}
          </ul>
        </>
      )}

      <Painel
        aberto={emEdicao !== null}
        aoFechar={() => setEmEdicao(null)}
        titulo={editando ? 'Editar conta' : 'Nova conta'}
      >
        <form key={editando?.id ?? 'nova'} onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(id) => (
              <Input
                id={id}
                name="nome"
                placeholder="Conta corrente"
                defaultValue={editando?.nome}
                required
                autoFocus
              />
            )}
          </Campo>

          <Campo rotulo="Tipo">
            {(id) => (
              <Select id={id} name="tipo" defaultValue={editando?.tipo ?? 'CHECKING'}>
                {tipoDeContaSchema.options.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULO_DO_TIPO_DE_CONTA[tipo]}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo
            rotulo="Saldo inicial"
            auxilio="O saldo de hoje. O que aconteceu antes não entra no sistema."
          >
            {(id) => (
              <Input
                id={id}
                name="saldoInicial"
                type="number"
                step="0.01"
                inputMode="decimal"
                defaultValue={editando?.saldoInicial ?? '0'}
              />
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Painel>
    </div>
  );
}
