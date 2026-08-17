import { useQuery } from '@tanstack/react-query';
import { CaretDown } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FechamentoDoHistorico } from '@controle/shared';
import { mesPorExtenso } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Valor } from '@/components/ui/valor';

/**
 * Os acertos já feitos.
 *
 * Os itens vêm da cópia gravada no dia do fechamento, e não dos títulos: o lançamento pode
 * ter sido editado depois, e o papel assinado precisa continuar batendo com o que foi
 * assinado.
 */
export function HistoricoDeFechamentos() {
  const [aberto, setAberto] = useState<string | null>(null);

  const historico = useQuery({
    queryKey: ['fechamentos'],
    queryFn: () => api.get<FechamentoDoHistorico[]>('/fechamentos'),
  });

  return (
    <div className="flex flex-col gap-4">
      <TituloDaSecao
        titulo="Fechamentos"
        descricao="Os acertos de contas já feitos, com os títulos como estavam no dia."
      />

      {historico.isLoading && <Carregando />}
      {historico.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => historico.refetch()} />
      )}

      {historico.data?.length === 0 && (
        <Vazio
          titulo="Nenhum fechamento ainda"
          descricao="Ao acertar as contas com alguém em Pessoas → Fechamento, o acerto fica registrado aqui."
        />
      )}

      <ul className="flex flex-col gap-2">
        {historico.data?.map((fechamento) => {
          const expandido = aberto === fechamento.id;

          return (
            <li key={fechamento.id}>
              <Cartao className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setAberto(expandido ? null : fechamento.id)}
                  aria-expanded={expandido}
                  className="flex min-h-14 items-center gap-3 p-4 text-left transition-colors hover:bg-superficie-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-texto">
                      nº {fechamento.numero} — {fechamento.participante}
                    </span>
                    <span className="text-xs text-texto-suave">
                      {mesPorExtenso(fechamento.mes)} · fechado em{' '}
                      {formatarData(fechamento.fechadoEm)} · {fechamento.itens.length} título
                      {fechamento.itens.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <Valor valor={fechamento.saldo} tom="automatico" />

                  <CaretDown
                    size={18}
                    aria-hidden
                    className={`shrink-0 text-texto-suave transition-transform ${expandido ? 'rotate-180' : ''}`}
                  />
                </button>

                {expandido && (
                  <div className="flex flex-col gap-3 border-t border-borda p-4">
                    <div className="flex flex-col gap-1">
                      <Linha rotulo="Total a receber" valor={fechamento.totalAReceber} />
                      <Linha rotulo="Total a pagar" valor={fechamento.totalAPagar} />
                    </div>

                    <ul className="flex flex-col gap-1 border-t border-borda pt-3">
                      {fechamento.itens.map((item, indice) => (
                        <li
                          key={`${fechamento.id}-${indice}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-xs text-texto-suave">
                              {item.aReceber ? 'recebi' : 'paguei'}
                            </span>
                            <span className="truncate text-sm text-texto">{item.descricao}</span>
                          </span>

                          <Valor valor={item.valor} />
                        </li>
                      ))}
                    </ul>

                    {fechamento.acertoId && (
                      <p className="border-t border-borda pt-3 text-xs text-texto-suave">
                        A diferença virou uma conta nova.
                      </p>
                    )}

                    <Link
                      to={`/app/pessoas/${fechamento.participanteId}/fechamento`}
                      className="text-sm font-medium text-destaque underline transition-opacity hover:opacity-80"
                    >
                      Abrir o fechamento de {fechamento.participante}
                    </Link>
                  </div>
                )}
              </Cartao>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-texto-suave">{rotulo}</span>
      <Valor valor={valor} />
    </div>
  );
}
