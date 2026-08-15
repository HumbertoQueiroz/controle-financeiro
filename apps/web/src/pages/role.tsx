import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ROTULO_DA_FORMA_DE_PAGAMENTO, type Despesa, type Membro } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

export function DetalheDoRole() {
  const { id = '' } = useParams();
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const despesas = useQuery({
    queryKey: ['despesas', id],
    queryFn: () => api.get<Despesa[]>(`/roles/${id}/despesas`),
  });

  // Os participantes possíveis são os membros do grupo. A lista vem da própria despesa
  // existente ou, quando não há nenhuma, precisa ser buscada — por isso o grupo é
  // descoberto a partir da primeira despesa ou informado pela navegação.
  const membros = useQuery({
    queryKey: ['membros-do-role', id],
    queryFn: () => api.get<Membro[]>(`/roles/${id}/membros`).catch(() => [] as Membro[]),
  });

  const criar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post<Despesa>(`/roles/${id}/despesas`, dados),
    onSuccess: async () => {
      setAberto(false);
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['despesas', id] });
      await clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] });
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const excluir = useMutation({
    mutationFn: (despesaId: string) => api.delete(`/despesas/${despesaId}`),
    onSuccess: () => clienteDeQuery.invalidateQueries({ queryKey: ['despesas', id] }),
  });

  // Quem pode pagar sai de quem já aparece nas cotas das despesas existentes; sem
  // despesa nenhuma, a lista de membros é buscada.
  const participantes =
    membros.data && membros.data.length > 0
      ? membros.data.map((membro) => ({ id: membro.pessoaId, nome: membro.nome }))
      : (despesas.data?.[0]?.cotas.map((cota) => ({ id: cota.pessoaId, nome: cota.nome })) ?? []);

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    criar.mutate({
      descricao: String(dados.get('descricao')),
      valor: String(dados.get('valor')),
      formaDePagamento: String(dados.get('formaDePagamento')),
      pagantePessoaId: String(dados.get('pagantePessoaId')),
    });
  };

  return (
    <>
      <TituloDaSecao
        titulo="Despesas do rolê"
        descricao="Sem escolher entre quem dividir, divide entre todos os participantes."
        acao={
          <Button onClick={() => setAberto(true)}>
            <Plus size={18} aria-hidden />
            Nova despesa
          </Button>
        }
      />

      {despesas.isLoading && <Carregando />}
      {despesas.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => despesas.refetch()} />
      )}

      {despesas.data?.length === 0 && (
        <Vazio
          titulo="Nenhuma despesa"
          descricao="Lance o que foi gasto para o rateio ser calculado."
          acao={<Button onClick={() => setAberto(true)}>Lançar despesa</Button>}
        />
      )}

      {despesas.data && despesas.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {despesas.data.map((despesa) => (
            <li key={despesa.id}>
              <Cartao className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-texto">{despesa.descricao}</p>
                    <p className="text-xs text-texto-suave">
                      {despesa.pagante} pagou ·{' '}
                      {ROTULO_DA_FORMA_DE_PAGAMENTO[despesa.formaDePagamento]}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Valor valor={despesa.valor} />
                    <Button
                      variante="fantasma"
                      tamanho="icone"
                      aria-label={`Excluir ${despesa.descricao}`}
                      onClick={() => excluir.mutate(despesa.id)}
                    >
                      <Trash size={18} aria-hidden />
                    </Button>
                  </div>
                </div>

                <dl className="flex flex-col gap-1 border-t border-borda pt-3">
                  {despesa.cotas.map((cota) => (
                    <div key={cota.pessoaId} className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-texto-suave">{cota.nome}</dt>
                      <dd>
                        <Valor valor={cota.valor} className="text-xs" />
                      </dd>
                    </div>
                  ))}
                </dl>
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      <Painel aberto={aberto} aoFechar={() => setAberto(false)} titulo="Nova despesa">
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Descrição">
            {(campoId) => (
              <Input id={campoId} name="descricao" placeholder="Carne" required autoFocus />
            )}
          </Campo>

          <Campo rotulo="Valor">
            {(campoId) => (
              <Input
                id={campoId}
                name="valor"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
              />
            )}
          </Campo>

          <Campo rotulo="Quem pagou">
            {(campoId) => (
              <Select id={campoId} name="pagantePessoaId" required>
                {participantes.map((pessoa) => (
                  <option key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo rotulo="Forma de pagamento">
            {(campoId) => (
              <Select id={campoId} name="formaDePagamento" defaultValue="CASH">
                {Object.entries(ROTULO_DA_FORMA_DE_PAGAMENTO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
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

          <Button type="submit" largura="cheia" disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Painel>
    </>
  );
}
