import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { SaldosDosParticipantes } from '@controle/shared';
import { formatarValor, paraCentavos } from '@controle/shared';
import { api } from '@/lib/api';
import { deslocarMes, formatarMes, mesAtual } from '@/lib/utils';
import { useParametroDaUrl } from '@/lib/url';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { Valor } from '@/components/ui/valor';

/**
 * Com quem as contas estão desacertadas.
 *
 * O fechamento já respondia isto, mas para **uma** pessoa por vez — descobrir com quem
 * havia pendência exigia abrir uma tela por participante. Esta é a lista que faltava, e é
 * o destino do "ver todos" dos participantes no dashboard.
 *
 * O recorte é o mesmo do fechamento: tudo que vence **até** o fim do mês escolhido. Uma
 * conta de junho que ninguém pagou continua devida em agosto, e mostrá-la só em junho
 * esconderia a dívida mais antiga, que é justamente a que precisa aparecer.
 */
export function Participantes() {
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());

  const saldos = useQuery({
    queryKey: ['saldos-participantes', mes],
    queryFn: () => api.get<SaldosDosParticipantes>(`/participantes/saldos?mes=${mes}`),
  });

  const participantes = saldos.data?.participantes ?? [];
  const comSaldo = participantes.filter((item) => paraCentavos(item.saldo) !== 0);
  const quites = participantes.filter((item) => paraCentavos(item.saldo) === 0);

  const totalAReceber = comSaldo
    .filter((item) => paraCentavos(item.saldo) > 0)
    .reduce((soma, item) => soma + paraCentavos(item.saldo), 0);
  const totalAPagar = comSaldo
    .filter((item) => paraCentavos(item.saldo) < 0)
    .reduce((soma, item) => soma - paraCentavos(item.saldo), 0);

  return (
    <>
      <TituloDaSecao
        titulo="Participantes"
        descricao="Quanto cada pessoa deve a você, e quanto você deve a cada uma, até o fim do mês."
      />

      <SeletorDeMes
        mes={mes}
        aoVoltar={() => setMes(deslocarMes(mes, -1))}
        aoAvancar={() => setMes(deslocarMes(mes, 1))}
      />

      {saldos.isLoading && <Carregando linhas={3} />}
      {saldos.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => saldos.refetch()} />
      )}

      {saldos.data && participantes.length === 0 && (
        <Vazio
          titulo="Nenhuma pessoa cadastrada"
          descricao="Cadastre quem divide contas com você para acompanhar o saldo de cada um."
          acao={
            <Link to="/app/pessoas">
              <span className="text-sm text-destaque">Ir para Pessoas</span>
            </Link>
          }
        />
      )}

      {comSaldo.length > 0 && (
        <Cartao className="flex items-center justify-between gap-4 p-4">
          {[
            ['A receber', totalAReceber, 'text-entrada'],
            ['A pagar', totalAPagar, 'text-saida'],
          ].map(([rotulo, valor, cor]) => (
            <div key={String(rotulo)} className="flex flex-col gap-0.5">
              <span className="text-xs text-texto-suave">{String(rotulo)}</span>
              <span className={`text-lg font-semibold tabular-nums ${cor}`}>
                {formatarValor(String(Number(valor) / 100))}
              </span>
            </div>
          ))}
        </Cartao>
      )}

      {comSaldo.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comSaldo.map((item) => (
            <li key={item.id}>
              <Link to={`/app/pessoas/${item.id}/fechamento?mes=${mes}`}>
                <Cartao className="flex min-h-14 items-center gap-3 p-4 transition-colors hover:bg-superficie-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-texto">{item.nome}</span>
                    <span className="text-xs text-texto-suave">
                      {paraCentavos(item.saldo) > 0 ? 'deve a você' : 'você deve'} · {item.titulos}{' '}
                      título{item.titulos === 1 ? '' : 's'} em aberto
                      {item.temConta ? ' · tem conta' : ''}
                    </span>
                  </div>

                  {/* O saldo é o número da linha; as duas pontas ficam abaixo, em texto
                      pequeno, porque quem varre a lista quer o líquido. */}
                  <div className="flex flex-col items-end gap-0.5">
                    <Valor valor={item.saldo} />
                    <span className="text-xs tabular-nums text-texto-suave">
                      {formatarValor(item.aReceber)} − {formatarValor(item.aPagar)}
                    </span>
                  </div>

                  <ArrowRight size={16} aria-hidden className="shrink-0 text-texto-suave" />
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {quites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm text-texto-suave">
            <Check size={16} aria-hidden className="text-positivo" />
            Sem pendência
          </h2>

          {/* Quem está quite continua na tela, e não some: "não aparece" e "não deve nada"
              são coisas diferentes, e confundi-las faz procurar a pessoa achando que o
              cadastro sumiu. */}
          <ul className="flex flex-wrap gap-2">
            {quites.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/app/pessoas/${item.id}/fechamento?mes=${mes}`}
                  className="flex min-h-11 items-center rounded-full border border-borda px-4 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
                >
                  {item.nome}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {saldos.data && participantes.length > 0 && comSaldo.length === 0 && (
        <Vazio
          titulo={`Tudo acertado em ${formatarMes(mes)}`}
          descricao="Ninguém deve a você e você não deve a ninguém neste período."
        />
      )}
    </>
  );
}
