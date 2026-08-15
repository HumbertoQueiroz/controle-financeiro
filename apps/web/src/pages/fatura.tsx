import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { Lancamento, Pessoa } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { Select } from '@/components/ui/campo';
import { TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { ListaDeDados, type ColunaDaLista } from '@/components/ui/lista-de-dados';
import { Valor } from '@/components/ui/valor';

export function DetalheDaFatura() {
  const { id = '' } = useParams();
  const clienteDeQuery = useQueryClient();

  const lancamentos = useQuery({
    queryKey: ['lancamentos', id],
    queryFn: () => api.get<Lancamento[]>(`/faturas/${id}/lancamentos`),
  });

  const pessoas = useQuery({ queryKey: ['pessoas'], queryFn: () => api.get<Pessoa[]>('/pessoas') });

  const repassar = useMutation({
    mutationFn: ({ lancamentoId, pessoaId }: { lancamentoId: string; pessoaId: string | null }) =>
      api.patch(`/lancamentos/${lancamentoId}/repasse`, { pessoaId }),
    onSuccess: async () => {
      await clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos', id] });
      await clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] });
    },
  });

  const colunas: ColunaDaLista<Lancamento>[] = [
    {
      chave: 'descricao',
      titulo: 'Descrição',
      principal: true,
      render: (item) => (
        <span className="flex flex-col gap-0.5">
          {item.descricao}
          {item.parcelaTotal && (
            <span className="text-xs font-normal text-texto-suave">
              Parcela {item.parcelaNumero} de {item.parcelaTotal}
            </span>
          )}
        </span>
      ),
    },
    { chave: 'data', titulo: 'Data', render: (item) => formatarData(item.data) },
    {
      chave: 'repasse',
      titulo: 'Repassado a',
      render: (item) => (
        <Select
          aria-label={`Repassar ${item.descricao} para`}
          value={item.repassadoParaPessoaId ?? ''}
          onChange={(evento) =>
            repassar.mutate({ lancamentoId: item.id, pessoaId: evento.target.value || null })
          }
          className="text-xs"
        >
          <option value="">Ninguém</option>
          {pessoas.data
            ?.filter((pessoa) => pessoa.editavel)
            .map((pessoa) => (
              <option key={pessoa.id} value={pessoa.id}>
                {pessoa.nome}
              </option>
            ))}
        </Select>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinharADireita: true,
      // Estorno vem negativo e o tom automático o mostra em verde com sinal de mais:
      // é crédito, e apresentá-lo igual a uma compra confundiria a conferência.
      render: (item) => (
        <Valor valor={item.valor} tom={Number(item.valor) < 0 ? 'positivo' : 'neutro'} />
      ),
    },
  ];

  return (
    <>
      <TituloDaSecao
        titulo="Lançamentos"
        descricao="Marque quem vai te reembolsar — isso gera um a receber daquela pessoa."
      />

      {lancamentos.isLoading && <Carregando linhas={5} />}
      {lancamentos.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lancamentos.refetch()} />
      )}

      {lancamentos.data?.length === 0 && (
        <Vazio
          titulo="Fatura sem lançamentos"
          descricao="Importe o CSV para preencher esta fatura."
        />
      )}

      {lancamentos.data && lancamentos.data.length > 0 && (
        <ListaDeDados itens={lancamentos.data} colunas={colunas} chaveDoItem={(item) => item.id} />
      )}
    </>
  );
}
