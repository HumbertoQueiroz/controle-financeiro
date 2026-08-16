import { useQuery } from '@tanstack/react-query';
import { UploadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Cartao as TipoDeCartao, Fatura } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
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

      <AssistenteDeImportacao
        aberto={importando}
        aoFechar={() => setImportando(false)}
        cartoes={cartoes.data ?? []}
      />
    </>
  );
}
