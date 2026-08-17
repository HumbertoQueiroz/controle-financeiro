import { useQuery } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { ROTULO_DA_DIRECAO, type Direcao, type Lancamento } from '@controle/shared';
import { api } from '@/lib/api';
import { cn, deslocarMes, formatarMes, mesAtual } from '@/lib/utils';
import { useParametroDaUrl } from '@/lib/url';
import { Button } from '@/components/ui/button';
import { TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { ListaDeLancamentos } from '@/features/lancamentos/lista-de-lancamentos';
import { PainelDeLancamento } from '@/features/lancamentos/painel-de-lancamento';

type Situacao = 'ABERTAS' | 'BAIXADAS' | 'TODAS';

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'ABERTAS', rotulo: 'Em aberto' },
  { valor: 'BAIXADAS', rotulo: 'Baixadas' },
  { valor: 'TODAS', rotulo: 'Todas' },
];

/**
 * De onde o lançamento veio, com nome de produto em vez de nome de coluna.
 *
 * O filtro é nomeado na URL (`?filtro=faturas`) e traduzido aqui para os parâmetros da
 * API. Assim o link do dashboard fala a língua da tela — e mudar o recorte de "dinheiro e
 * vale" no futuro não quebra nenhum link já compartilhado.
 */
const FILTROS: { valor: string; rotulo: string; consulta: string; direcao?: Direcao }[] = [
  { valor: 'todos', rotulo: 'Tudo', consulta: '' },
  {
    valor: 'caixa',
    rotulo: 'Dinheiro, vale e permuta',
    // As três formas que **não** são cartão. Faltando a permuta aqui, o total do bloco do
    // dashboard deixaria de bater com o da lista que ele abre.
    consulta: '&formaDePagamento=CASH&formaDePagamento=MEAL_VOUCHER&formaDePagamento=BARTER',
  },
  // `cartao` é por **forma de pagamento**, e não por origem: junto com `caixa` ele parte a
  // lista em duas metades que não se cruzam, e é essa partição que o dashboard soma. Por
  // origem, a mesma conta de rateio paga em dinheiro cairia nos dois lados.
  { valor: 'cartao', rotulo: 'Cartão de crédito', consulta: '&formaDePagamento=CREDIT_CARD' },
  { valor: 'faturas', rotulo: 'Só faturas', consulta: '&origem=INVOICE', direcao: 'PAYABLE' },
  { valor: 'rateio', rotulo: 'Rateio', consulta: '&origem=GROUP_EXPENSE' },
  { valor: 'repasse', rotulo: 'Repasse de cartão', consulta: '&origem=CARD_ENTRY' },
  { valor: 'recorrentes', rotulo: 'Recorrentes', consulta: '&origem=RECURRENCE' },
];

/**
 * Contas a receber e a pagar.
 *
 * É a mesma tela com a direção trocada: as duas listas têm a mesma estrutura, as mesmas
 * ações e a mesma leitura. Duplicar o arquivo faria a correção de um lado esquecer o outro.
 */
export function Contas({ direcao }: { direcao: Direcao }) {
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());
  const [situacao, setSituacao] = useParametroDaUrl('situacao', 'ABERTAS');
  const [filtro, setFiltro] = useParametroDaUrl('filtro', 'todos');
  const [lancando, setLancando] = useState(false);

  const disponiveis = FILTROS.filter((item) => !item.direcao || item.direcao === direcao);
  const escolhido = disponiveis.find((item) => item.valor === filtro) ?? disponiveis[0]!;

  const lancamentos = useQuery({
    queryKey: ['lancamentos', direcao, mes, situacao, escolhido.valor],
    queryFn: () =>
      api.get<Lancamento[]>(
        `/lancamentos?direcao=${direcao}&mes=${mes}&situacao=${situacao}${escolhido.consulta}`,
      ),
  });

  const ehEntrada = direcao === 'RECEIVABLE';

  return (
    <>
      <TituloDaSecao
        titulo={`Contas ${ROTULO_DA_DIRECAO[direcao].toLowerCase()}`}
        descricao={
          ehEntrada
            ? 'Salário, reembolsos e outras entradas. O salário pode ser cadastrado uma vez e repetir todo mês.'
            : 'Aluguel, assinaturas e demais saídas, incluindo o que vem da fatura e do rateio.'
        }
        acao={
          <Button onClick={() => setLancando(true)}>
            <Plus size={18} aria-hidden />
            {ehEntrada ? 'Nova entrada' : 'Nova saída'}
          </Button>
        }
      />

      <SeletorDeMes
        mes={mes}
        aoVoltar={() => setMes(deslocarMes(mes, -1))}
        aoAvancar={() => setMes(deslocarMes(mes, 1))}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {SITUACOES.map((item) => (
            <Ficha
              key={item.valor}
              rotulo={item.rotulo}
              ativa={situacao === item.valor}
              aoTocar={() => setSituacao(item.valor)}
            />
          ))}
        </div>

        {/* A origem é um segundo eixo, e por isso numa linha própria: misturada com a
            situação, pareceria que escolher "Faturas" desmarca "Em aberto". */}
        <div className="flex flex-wrap gap-2">
          {disponiveis.map((item) => (
            <Ficha
              key={item.valor}
              rotulo={item.rotulo}
              ativa={escolhido.valor === item.valor}
              aoTocar={() => setFiltro(item.valor)}
              discreta
            />
          ))}
        </div>
      </div>

      {lancamentos.isLoading && <Carregando linhas={4} />}
      {lancamentos.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lancamentos.refetch()} />
      )}

      {lancamentos.data?.length === 0 && (
        <Vazio
          titulo={`Nada ${situacao === 'BAIXADAS' ? 'baixado' : 'em aberto'} em ${formatarMes(mes)}`}
          descricao={
            escolhido.valor !== 'todos'
              ? `Nenhum lançamento de "${escolhido.rotulo}" neste mês. Toque em Tudo para ver o resto.`
              : ehEntrada
                ? 'Lance o que você tem a receber neste mês.'
                : 'Lance o que você tem a pagar neste mês.'
          }
          acao={
            escolhido.valor !== 'todos' ? (
              <Button variante="secundaria" onClick={() => setFiltro('todos')}>
                Ver tudo
              </Button>
            ) : (
              <Button onClick={() => setLancando(true)}>Lançar</Button>
            )
          }
        />
      )}

      {lancamentos.data && lancamentos.data.length > 0 && (
        <ListaDeLancamentos itens={lancamentos.data} />
      )}

      <PainelDeLancamento aberto={lancando} aoFechar={() => setLancando(false)} direcao={direcao} />
    </>
  );
}

function Ficha({
  rotulo,
  ativa,
  aoTocar,
  discreta,
}: {
  rotulo: string;
  ativa: boolean;
  aoTocar: () => void;
  discreta?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      aria-pressed={ativa}
      className={cn(
        'min-h-11 rounded-full border px-4 text-sm transition-colors',
        ativa
          ? discreta
            ? 'border-borda bg-superficie-2 font-medium text-texto hover:opacity-90'
            : 'border-destaque bg-destaque-suave font-medium text-destaque hover:opacity-90'
          : 'border-borda text-texto-suave hover:bg-superficie-2 hover:text-texto',
      )}
    >
      {rotulo}
    </button>
  );
}

export function ContasAReceber() {
  return <Contas direcao="RECEIVABLE" />;
}

export function ContasAPagar() {
  return <Contas direcao="PAYABLE" />;
}
