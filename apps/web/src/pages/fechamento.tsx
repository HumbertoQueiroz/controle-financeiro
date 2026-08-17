import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AgendaDeFechamento, FechamentoDoParticipante, Lancamento } from '@controle/shared';
import { deCentavos, mesPorExtenso, paraCentavos, somarCentavos } from '@controle/shared';
import { api } from '@/lib/api';
import { useParametroDaUrl } from '@/lib/url';
import { deslocarMes, formatarData, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cartao } from '@/components/ui/cartao';
import { Input } from '@/components/ui/campo';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { Valor } from '@/components/ui/valor';
import { PainelDeQuitacao } from '@/features/participantes/painel-quitacao';

/**
 * Acerto de contas com um participante.
 *
 * A tela é ao mesmo tempo a conferência e o papel: o mesmo HTML vira a folha impressa, com
 * o CSS de impressão escondendo o que é navegação. Uma segunda montagem só para o PDF
 * divergiria da tela no primeiro ajuste, e o número conferido não seria o número impresso.
 */
export function Fechamento() {
  const { id = '' } = useParams();
  const clienteDeQuery = useQueryClient();
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [quitando, setQuitando] = useState(false);

  const fechamento = useQuery({
    queryKey: ['fechamento', id, mes],
    queryFn: () => api.get<FechamentoDoParticipante>(`/participantes/${id}/fechamento?mes=${mes}`),
  });

  const dados = fechamento.data;

  const alternar = (lancamentoId: string) =>
    setDesmarcados((atual) => {
      const proximo = new Set(atual);

      if (proximo.has(lancamentoId)) proximo.delete(lancamentoId);
      else proximo.add(lancamentoId);

      return proximo;
    });

  // O saldo é recalculado a partir do que está marcado, e não do total que veio da API:
  // desmarcar uma conta precisa mudar o número na hora, senão a pessoa confirma um acerto
  // diferente do que está vendo.
  const selecao = useMemo(() => {
    const marcados = (itens: Lancamento[]) => itens.filter((item) => !desmarcados.has(item.id));
    const somar = (itens: Lancamento[]) =>
      somarCentavos(itens.map((item) => paraCentavos(item.restante)));

    const aReceber = marcados(dados?.aReceber ?? []);
    const aPagar = marcados(dados?.aPagar ?? []);
    const totalAReceber = somar(aReceber);
    const totalAPagar = somar(aPagar);

    return {
      ids: [...aReceber, ...aPagar].map((item) => item.id),
      totalAReceber: deCentavos(totalAReceber),
      totalAPagar: deCentavos(totalAPagar),
      saldoEmCentavos: totalAReceber - totalAPagar,
    };
  }, [dados, desmarcados]);

  const vazio = (dados?.aReceber.length ?? 0) + (dados?.aPagar.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* `sem-impressao`: navegação, setas e botões não pertencem a uma folha de papel. */}
      <div className="sem-impressao flex items-center justify-between gap-2">
        <Link
          to="/app/pessoas"
          className="flex min-h-11 items-center gap-1 text-sm text-texto-suave transition-colors hover:text-texto"
        >
          <ArrowLeft size={16} aria-hidden />
          Pessoas
        </Link>

        <Button variante="secundaria" tamanho="pequeno" onClick={() => window.print()}>
          <Printer size={16} aria-hidden />
          Imprimir relatório
        </Button>
      </div>

      <div className="sem-impressao">
        <SeletorDeMes
          mes={mes}
          aoVoltar={() => setMes(deslocarMes(mes, -1))}
          aoAvancar={() => setMes(deslocarMes(mes, 1))}
        />
      </div>

      {fechamento.isLoading && <Carregando />}
      {fechamento.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => fechamento.refetch()} />
      )}

      {dados && (
        <>
          {/* O cabeçalho do papel: quem, qual mês, qual número. Na tela ele também serve,
              e é o que identifica a folha depois de impressa. */}
          <header className="flex flex-col gap-1 border-b border-borda pb-3">
            <h1 className="text-lg font-semibold text-texto">
              Fechamento nº {dados.proximoNumero} — {dados.participante.nome}
            </h1>
            <p className="text-sm capitalize text-texto-suave">{formatarMes(dados.mes)}</p>
            <p className="text-xs text-texto-suave">
              Inclui o que vence até o fim do mês, mais as contas anteriores ainda em aberto.
            </p>
          </header>

          {vazio ? (
            <Vazio
              titulo="Nada a acertar"
              descricao={`Não há contas em aberto com ${dados.participante.nome} até ${formatarMes(dados.mes)}.`}
            />
          ) : (
            <>
              <Resumo
                aReceber={selecao.totalAReceber}
                aPagar={selecao.totalAPagar}
                saldo={deCentavos(selecao.saldoEmCentavos)}
                nome={dados.participante.nome}
              />

              <Secao
                titulo="A receber"
                descricao={`O que ${dados.participante.nome} deve a você`}
                itens={dados.aReceber}
                desmarcados={desmarcados}
                aoAlternar={alternar}
              />

              <Secao
                titulo="A pagar"
                descricao={`O que você deve a ${dados.participante.nome}`}
                itens={dados.aPagar}
                desmarcados={desmarcados}
                aoAlternar={alternar}
              />

              {/* Assinaturas: uma folha de acerto entre duas pessoas costuma ser assinada,
                  e sem espaço reservado a impressão obriga a rabiscar na margem. */}
              <div className="apenas-impressao mt-12 flex justify-between gap-8">
                <div className="flex-1 border-t border-black pt-1 text-center text-xs">Você</div>
                <div className="flex-1 border-t border-black pt-1 text-center text-xs">
                  {dados.participante.nome}
                </div>
              </div>

              <Agenda
                participanteId={id}
                nome={dados.participante.nome}
                agenda={dados.agenda}
                aoMudar={() => {
                  void clienteDeQuery.invalidateQueries({ queryKey: ['avisos'] });

                  return fechamento.refetch();
                }}
              />

              <div className="sem-impressao flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  largura="cheia"
                  onClick={() => setQuitando(true)}
                  disabled={selecao.ids.length === 0}
                  className="sm:w-auto"
                >
                  Quitar {selecao.ids.length} conta{selecao.ids.length === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}

          <PainelDeQuitacao
            aberto={quitando}
            aoFechar={() => setQuitando(false)}
            participanteId={id}
            mes={mes}
            numero={dados.proximoNumero}
            nomeDoParticipante={dados.participante.nome}
            lancamentosIds={selecao.ids}
            saldoEmCentavos={selecao.saldoEmCentavos}
            aoConcluir={() => {
              setDesmarcados(new Set());
              return fechamento.refetch();
            }}
          />
        </>
      )}
    </div>
  );
}

function Resumo({
  aReceber,
  aPagar,
  saldo,
  nome,
}: {
  aReceber: string;
  aPagar: string;
  saldo: string;
  nome: string;
}) {
  const positivo = !saldo.startsWith('-');

  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <Linha rotulo="Total a receber" valor={aReceber} />
      <Linha rotulo="Total a pagar" valor={aPagar} />

      <div className="flex items-center justify-between gap-3 border-t border-borda pt-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-texto">Saldo</span>
          {/* O sinal sozinho não diz quem paga quem. A frase diz. */}
          <span className="text-xs text-texto-suave">
            {saldo === '0.00'
              ? 'As contas se anulam'
              : positivo
                ? `${nome} deve a você`
                : `Você deve a ${nome}`}
          </span>
        </div>

        <Valor valor={saldo} tom="automatico" />
      </div>
    </Cartao>
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

function Secao({
  titulo,
  descricao,
  itens,
  desmarcados,
  aoAlternar,
}: {
  titulo: string;
  descricao: string;
  itens: Lancamento[];
  desmarcados: Set<string>;
  aoAlternar: (id: string) => void;
}) {
  if (itens.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        <p className="text-xs text-texto-suave">{descricao}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {itens.map((item) => {
          const incluido = !desmarcados.has(item.id);

          return (
            <li key={item.id}>
              {/* A linha inteira é o alvo do toque: uma caixa de 16px é alvo ruim no
                  celular, e aqui marcar e desmarcar é a ação principal da tela. */}
              <label
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-padrao border border-borda p-3 transition-colors hover:bg-superficie-2 ${
                  incluido ? '' : 'opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={incluido}
                  onChange={() => aoAlternar(item.id)}
                  aria-label={`Incluir ${item.descricao} no fechamento`}
                  className="sem-impressao h-4 w-4 shrink-0"
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-texto">{item.descricao}</span>
                  <span className="text-xs text-texto-suave">
                    Vence {formatarData(item.vencimento)}
                    {item.atrasado && ' · atrasado'}
                    {item.status === 'PARTIAL' && ' · parcial'}
                    {!incluido && ' · fora deste fechamento'}
                  </span>
                </div>

                <Valor valor={item.restante} />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A combinação de repetir o fechamento todo mês.
 *
 * Ela **não** fecha nada sozinha: marca a partir de que dia o acerto do mês anterior passa
 * a ser cobrado na tela e nos avisos. Fechar por conta própria quitaria títulos sem ninguém
 * conferir, e a conferência é a razão de o fechamento existir.
 */
function Agenda({
  participanteId,
  nome,
  agenda,
  aoMudar,
}: {
  participanteId: string;
  nome: string;
  agenda: AgendaDeFechamento | null;
  aoMudar: () => Promise<unknown>;
}) {
  const ativa = agenda?.ativa ?? false;
  const [dia, setDia] = useState(agenda?.diaDoMes ?? 1);

  const definir = useMutation({
    mutationFn: (dados: { ativa: boolean; diaDoMes: number }) =>
      api.put(`/participantes/${participanteId}/fechamento/agenda`, dados),
    onSuccess: aoMudar,
  });

  return (
    <Cartao className="sem-impressao flex flex-col gap-3 p-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-texto">
        <input
          type="checkbox"
          checked={ativa}
          onChange={(evento) => definir.mutate({ ativa: evento.target.checked, diaDoMes: dia })}
          className="h-4 w-4"
        />
        Acertar as contas com {nome} todo mês
      </label>

      {ativa && (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            A partir do dia
            <Input
              type="number"
              min={1}
              max={31}
              value={dia}
              onChange={(evento) => setDia(Number(evento.target.value))}
              onBlur={() => definir.mutate({ ativa: true, diaDoMes: dia })}
              className="w-20"
              aria-label="Dia do mês"
            />
            de cada mês
          </label>

          <p className="text-xs text-texto-suave">
            {agenda?.mesPendente
              ? `O acerto de ${mesPorExtenso(agenda.mesPendente)} está esperando.`
              : 'Nada esperando agora. O aviso aparece quando o mês fechar.'}
            {agenda?.ultimoMes && ` Último fechado: ${mesPorExtenso(agenda.ultimoMes)}.`}
          </p>
        </>
      )}
    </Cartao>
  );
}
