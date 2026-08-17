import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash, UploadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  Cartao as TipoDeCartao,
  Fatura,
  Importacao,
  ResultadoDaExclusao,
} from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';
import { AssistenteDeImportacao } from '@/features/cartao/assistente-de-importacao';

const ROTULO_DO_STATUS: Record<Fatura['status'], string> = {
  OPEN: 'Em aberto',
  CLOSED: 'Fechada',
  PAID: 'Paga',
};

export function DetalheDoCartao() {
  const { id = '' } = useParams();
  const [importando, setImportando] = useState(false);

  const cartoes = useQuery({
    queryKey: ['cartoes'],
    queryFn: () => api.get<TipoDeCartao[]>('/cartoes'),
  });

  const faturas = useQuery({
    queryKey: ['faturas', id],
    queryFn: () => api.get<Fatura[]>(`/cartoes/${id}/faturas`),
  });

  const cartao = cartoes.data?.find((item) => item.id === id);

  return (
    <>
      <TituloDaSecao
        titulo="Faturas"
        descricao={
          cartao
            ? `${cartao.nome} · fecha dia ${cartao.diaDeFechamento}, vence dia ${cartao.diaDeVencimento}${cartao.compartilhado ? ' · compartilhado' : ''}`
            : undefined
        }
        acao={
          <Button onClick={() => setImportando(true)}>
            <UploadSimple size={18} aria-hidden />
            Importar CSV
          </Button>
        }
      />

      {faturas.isLoading && <Carregando />}
      {faturas.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => faturas.refetch()} />
      )}

      {faturas.data?.length === 0 && (
        <Vazio
          titulo="Nenhuma fatura ainda"
          descricao="Importe o CSV da fatura do seu banco para ver os lançamentos aqui."
          acao={<Button onClick={() => setImportando(true)}>Importar CSV</Button>}
        />
      )}

      {faturas.data && faturas.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {faturas.data.map((fatura) => (
            <li key={fatura.id}>
              <Link to={`/app/faturas/${fatura.id}`}>
                <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 transition-colors hover:bg-superficie-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium capitalize text-texto">
                      {formatarMes(fatura.mesDeReferencia)}
                    </p>
                    {/* As duas datas da fatura: quando fecha e quando vence. */}
                    <p className="text-xs text-texto-suave">
                      {ROTULO_DO_STATUS[fatura.status]} · fecha {formatarData(fatura.fechamento)} ·
                      vence {formatarData(fatura.vencimento)}
                    </p>
                  </div>

                  <Valor valor={fatura.total} />
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <HistoricoDeImportacoes cartaoId={id} />

      <AssistenteDeImportacao
        aberto={importando}
        aoFechar={() => setImportando(false)}
        cartoes={cartoes.data ?? []}
        // Sem isto, a importação aberta daqui caía no primeiro cartão da lista, e não no
        // cartão desta tela — o extrato ia para a fatura de outro cartão sem nada na tela
        // desmentir a expectativa de quem clicou.
        cartaoInicial={id}
      />
    </>
  );
}

/**
 * O que já foi importado neste cartão, e o caminho de volta.
 *
 * Existe pelo desfazer. Importar o arquivo errado, ou para o mês errado, é um erro fácil de
 * cometer e caro de corrigir à mão: são dezenas de lançamentos, mais as parcelas projetadas
 * nas faturas dos meses seguintes.
 */
function HistoricoDeImportacoes({ cartaoId }: { cartaoId: string }) {
  const clienteDeQuery = useQueryClient();
  const [confirmando, setConfirmando] = useState<Importacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const importacoes = useQuery({
    queryKey: ['importacoes', cartaoId],
    queryFn: () => api.get<Importacao[]>(`/cartoes/${cartaoId}/importacoes`),
  });

  const excluir = useMutation({
    mutationFn: (importacaoId: string) =>
      api.delete<ResultadoDaExclusao>(`/cartoes/${cartaoId}/importacoes/${importacaoId}`),
    onSuccess: async () => {
      setErro(null);
      setConfirmando(null);
      await Promise.all([
        clienteDeQuery.invalidateQueries({ queryKey: ['importacoes', cartaoId] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['faturas'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['parcelamentos'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
      ]);
    },
    onError: (falha) =>
      setErro(falha instanceof Error ? falha.message : 'Não foi possível excluir'),
  });

  if (!importacoes.data || importacoes.data.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-texto">Importações</h2>

      <ul className="flex flex-col gap-2">
        {importacoes.data.map((importacao) => (
          <li key={importacao.id}>
            <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm text-texto">{importacao.fileName}</p>
                <p className="text-xs text-texto-suave">
                  {formatarData(importacao.createdAt)} · {importacao.rowsInserted} lançamento(s)
                  {importacao.rowsSkipped > 0 ? ` · ${importacao.rowsSkipped} já existiam` : ''}
                </p>
              </div>

              <Button
                variante="fantasma"
                tamanho="icone"
                aria-label={`Excluir importação de ${importacao.fileName}`}
                onClick={() => {
                  setErro(null);
                  setConfirmando(importacao);
                }}
              >
                <Trash size={18} aria-hidden />
              </Button>
            </Cartao>
          </li>
        ))}
      </ul>

      <Painel
        aberto={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        titulo="Excluir importação"
        descricao="Isto apaga o que esta importação criou. As outras importações continuam como estão."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto">
            Serão apagados os lançamentos de <strong>{confirmando?.fileName}</strong>, as parcelas
            que ela projetou nas faturas seguintes e o pagamento que ela registrou.
          </p>

          <p className="text-sm text-texto-suave">
            As faturas são recalculadas, e as que ficarem sem nenhum lançamento saem da lista.
          </p>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variante="secundaria" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>

            <Button
              variante="destrutiva"
              onClick={() => excluir.mutate(confirmando!.id)}
              disabled={excluir.isPending}
            >
              {excluir.isPending ? 'Excluindo…' : 'Excluir importação'}
            </Button>
          </div>
        </div>
      </Painel>
    </section>
  );
}
