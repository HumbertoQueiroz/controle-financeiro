import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  SquaresFour,
  UsersThree,
  Warning,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type {
  BlocoDoDashboard,
  Dashboard as TipoDeDashboard,
  LinhaDoDashboard,
} from '@controle/shared';
import { formatarValor } from '@controle/shared';
import { api } from '@/lib/api';
import { cn, deslocarMes, mesAtual } from '@/lib/utils';
import { useParametroDaUrl } from '@/lib/url';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro } from '@/components/ui/estados';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { Valor } from '@/components/ui/valor';

/**
 * O mês inteiro numa tela.
 *
 * A tela responde uma pergunta dominante — "como está este mês?" — e todo o resto é caminho
 * para a tela que resolve. Por isso cada bloco leva **o número que a pessoa tocou** até o
 * destino: o link carrega o mês e o filtro, e o total da lista de destino bate com o do
 * card. Um "ver todos" que abrisse a lista inteira faria o número mudar no caminho, e é
 * assim que se perde a confiança num sistema de dinheiro.
 */
export function Dashboard() {
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());

  const dashboard = useQuery({
    queryKey: ['dashboard', mes],
    queryFn: () => api.get<TipoDeDashboard>(`/dashboard?mes=${mes}`),
  });

  const dados = dashboard.data;

  return (
    <>
      <TituloDaSecao
        titulo="Dashboard"
        descricao="O mês inteiro numa tela: o que entrou, o que falta e para onde foi."
      />

      <SeletorDeMes
        mes={mes}
        aoVoltar={() => setMes(deslocarMes(mes, -1))}
        aoAvancar={() => setMes(deslocarMes(mes, 1))}
      />

      {dashboard.isLoading && <Carregando linhas={5} />}
      {dashboard.isError && (
        <Erro
          mensagem="Não foi possível carregar o mês"
          aoTentarDeNovo={() => dashboard.refetch()}
        />
      )}

      {dados && (
        <>
          {/* A região dominante. O realizado ganha a borda de destaque porque é fato; o
              previsto é projeção, e empatá-los faria a tela responder duas perguntas ao
              mesmo tempo sem dizer qual importa agora. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <CartaoDeSaldo
              titulo="Saldo realizado"
              auxilio="O que de fato entrou e saiu até agora"
              dados={dados.saldoRealizado}
              destacado
            />
            <CartaoDeSaldo
              titulo="Saldo previsto"
              auxilio="Se tudo que vence neste mês acontecer"
              dados={dados.saldoPrevisto}
            />
          </div>

          {dados.atrasados > 0 && (
            <Link to={`/app/a-pagar?mes=${mes}`}>
              <Cartao className="flex items-center gap-3 border-atencao/40 p-4 transition-colors hover:bg-superficie-2">
                <Warning size={20} aria-hidden className="shrink-0 text-atencao" />
                <span className="flex-1 text-sm text-texto">
                  {dados.atrasados === 1
                    ? '1 lançamento venceu sem baixa'
                    : `${dados.atrasados} lançamentos venceram sem baixa`}
                </span>
                <CaretRight size={16} aria-hidden className="shrink-0 text-texto-suave" />
              </Cartao>
            </Link>
          )}

          <Secao
            titulo="A pagar"
            Icone={ArrowUp}
            total={dados.aPagar.total}
            tom="saida"
            blocos={dados.aPagar.blocos.map((bloco) => ({
              ...bloco,
              destino: `/app/a-pagar?mes=${mes}&filtro=${bloco.filtro}`,
            }))}
          />

          <Secao
            titulo="Por categoria"
            Icone={SquaresFour}
            blocos={[
              {
                chave: 'despesas',
                titulo: 'Despesas',
                total: dados.categorias.despesas.total,
                quantidade: dados.categorias.despesas.linhas.length,
                linhas: dados.categorias.despesas.linhas,
                destino: `/app/categorias?mes=${mes}&direcao=PAYABLE`,
                tom: 'saida' as const,
              },
              {
                chave: 'entradas',
                titulo: 'Entradas',
                total: dados.categorias.entradas.total,
                quantidade: dados.categorias.entradas.linhas.length,
                linhas: dados.categorias.entradas.linhas,
                destino: `/app/categorias?mes=${mes}&direcao=RECEIVABLE`,
                tom: 'entrada' as const,
              },
            ]}
          />

          <Secao
            titulo="Participantes"
            Icone={UsersThree}
            blocos={[
              {
                chave: 'a-receber',
                titulo: 'Têm a pagar a você',
                total: dados.participantes.aReceber.total,
                quantidade: dados.participantes.aReceber.quantidade,
                linhas: dados.participantes.aReceber.linhas,
                destino: `/app/participantes?mes=${mes}`,
                tom: 'entrada' as const,
              },
              {
                chave: 'a-pagar',
                titulo: 'Você tem a pagar',
                total: dados.participantes.aPagar.total,
                quantidade: dados.participantes.aPagar.quantidade,
                linhas: dados.participantes.aPagar.linhas,
                destino: `/app/participantes?mes=${mes}`,
                tom: 'saida' as const,
              },
            ]}
          />
        </>
      )}
    </>
  );
}

function CartaoDeSaldo({
  titulo,
  auxilio,
  dados,
  destacado,
}: {
  titulo: string;
  auxilio: string;
  dados: { entradas: string; saidas: string; saldo: string };
  destacado?: boolean;
}) {
  return (
    <Cartao className={cn('flex flex-1 flex-col gap-4 p-5', destacado && 'border-destaque')}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-texto-suave">{titulo}</p>
        <p className="text-xs text-texto-suave">{auxilio}</p>
      </div>

      <Valor valor={dados.saldo} tom="automatico" tamanho="grande" />

      <div className="flex gap-6">
        {[
          { rotulo: 'Entradas', valor: dados.entradas, cor: 'text-entrada', Icone: ArrowDown },
          { rotulo: 'Saídas', valor: dados.saidas, cor: 'text-saida', Icone: ArrowUp },
        ].map(({ rotulo, valor, cor, Icone }) => (
          <div key={rotulo} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xs text-texto-suave">
              <Icone size={12} aria-hidden className={cor} />
              {rotulo}
            </span>
            <span className={cn('text-sm font-medium tabular-nums', cor)}>
              {formatarValor(valor)}
            </span>
          </div>
        ))}
      </div>
    </Cartao>
  );
}

type BlocoDaTela = Omit<BlocoDoDashboard, 'filtro'> & {
  destino: string;
  tom?: 'entrada' | 'saida';
};

function Secao({
  titulo,
  Icone,
  total,
  tom,
  blocos,
}: {
  titulo: string;
  Icone: typeof ArrowUp;
  total?: string;
  tom?: 'entrada' | 'saida';
  blocos: BlocoDaTela[];
}) {
  // Um bloco vazio não vira caixa vazia: ela ocupa o mesmo espaço da que tem conteúdo e
  // faz a seção parecer quebrada. Sem nenhum bloco, a seção inteira sai da tela.
  const comConteudo = blocos.filter((bloco) => bloco.linhas.length > 0);

  if (comConteudo.length === 0) return null;

  return (
    <Cartao className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2.5">
        <Icone size={18} aria-hidden className="text-texto-suave" />
        <h2 className="flex-1 text-base font-semibold text-texto">{titulo}</h2>
        {total && (
          <span
            className={cn(
              'text-base font-semibold tabular-nums',
              tom === 'saida' ? 'text-saida' : tom === 'entrada' ? 'text-entrada' : 'text-texto',
            )}
          >
            {formatarValor(total)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        {comConteudo.map((bloco) => (
          <Bloco key={bloco.chave} bloco={bloco} />
        ))}
      </div>
    </Cartao>
  );
}

function Bloco({ bloco }: { bloco: BlocoDaTela }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-padrao border border-borda bg-fundo p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium text-texto-suave">{bloco.titulo}</span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            bloco.tom === 'saida'
              ? 'text-saida'
              : bloco.tom === 'entrada'
                ? 'text-entrada'
                : 'text-texto',
          )}
        >
          {formatarValor(bloco.total)}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {bloco.linhas.map((linha) => (
          <li key={linha.id ?? linha.rotulo}>
            <Linha linha={linha} />
          </li>
        ))}
      </ul>

      {/* O link leva o mês e o filtro do bloco: o total da tela de destino bate com o
          número acima, e é isso que faz o caminho valer a pena. */}
      <Link
        to={bloco.destino}
        className="flex min-h-11 items-center justify-end gap-1 text-xs text-destaque transition-opacity hover:opacity-80"
      >
        {bloco.quantidade > bloco.linhas.length
          ? `ver todos os ${bloco.quantidade}`
          : 'ver na lista'}
        <CaretRight size={12} aria-hidden />
      </Link>
    </div>
  );
}

function Linha({ linha }: { linha: LinhaDoDashboard }) {
  return (
    <div className="flex min-h-9 items-center gap-2.5 rounded-padrao bg-superficie-2 px-3 py-1.5">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: linha.cor ?? 'var(--cor-texto-suave)' }}
      />

      <span className="min-w-0 flex-1 truncate text-sm text-texto">{linha.rotulo}</span>

      {linha.atrasado && <span className="shrink-0 text-xs text-negativo">atrasado</span>}

      <span className="shrink-0 text-sm tabular-nums text-texto">{formatarValor(linha.valor)}</span>
    </div>
  );
}
