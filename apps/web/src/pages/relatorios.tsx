import { useQuery } from '@tanstack/react-query';
import type { Escopo, ItemDoRelatorio, Relatorio } from '@controle/shared';
import { api } from '@/lib/api';
import { useParametroDaUrl } from '@/lib/url';
import { formatarData } from '@/lib/utils';
import { useAutenticacao } from '@/auth/auth-context';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { ListaDeDados, type ColunaDaLista } from '@/components/ui/lista-de-dados';
import { Valor } from '@/components/ui/valor';
import { cn } from '@/lib/utils';

const MODOS: { valor: Escopo; rotulo: string }[] = [
  { valor: 'BOTH', rotulo: 'Ambos' },
  { valor: 'PAYABLE', rotulo: 'A pagar' },
  { valor: 'RECEIVABLE', rotulo: 'A receber' },
];

const ROTULO_DA_ORIGEM: Record<ItemDoRelatorio['origem'], string> = {
  INVOICE: 'Fatura',
  CARD_ENTRY: 'Repasse',
  GROUP_EXPENSE: 'Rateio',
  RECURRENCE: 'Recorrente',
  MANUAL: 'Manual',
};

export function Relatorios() {
  const { usuario } = useAutenticacao();
  const [modoNaUrl, setModo] = useParametroDaUrl('modo', 'BOTH');
  const modo: Escopo = modoNaUrl === 'PAYABLE' || modoNaUrl === 'RECEIVABLE' ? modoNaUrl : 'BOTH';
  const [situacao, setSituacao] = useParametroDaUrl('situacao', 'ABERTAS');

  const relatorio = useQuery({
    queryKey: ['relatorio', usuario?.id, modo, situacao],
    queryFn: () =>
      api.get<Relatorio>(`/relatorios/${usuario!.id}?escopo=${modo}&situacao=${situacao}`),
    enabled: Boolean(usuario),
  });

  const colunas: ColunaDaLista<ItemDoRelatorio>[] = [
    { chave: 'descricao', titulo: 'Descrição', principal: true, render: (item) => item.descricao },
    {
      chave: 'contraparte',
      titulo: 'Com quem',
      // Contraparte nula é a instituição do cartão, não uma pessoa.
      render: (item) => item.contraparte ?? 'Cartão',
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      render: (item) => ROTULO_DA_ORIGEM[item.origem],
      ocultarNoCelular: true,
    },
    { chave: 'vencimento', titulo: 'Vence', render: (item) => formatarData(item.vencimento) },
    {
      chave: 'restante',
      titulo: 'Valor',
      alinharADireita: true,
      render: (item) => <Valor valor={item.restante} />,
    },
  ];

  return (
    <>
      <TituloDaSecao titulo="Relatórios" descricao="Suas contas a pagar e a receber" />

      <div className="flex flex-wrap gap-2">
        {/* Os três modos que o README pede, como abas de toque confortável */}
        {MODOS.map((item) => (
          <button
            key={item.valor}
            type="button"
            onClick={() => setModo(item.valor)}
            aria-pressed={modo === item.valor}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm transition-colors',
              modo === item.valor
                ? 'border-destaque bg-destaque-suave font-medium text-destaque hover:opacity-90'
                : 'border-borda text-texto-suave hover:bg-superficie-2 hover:text-texto',
            )}
          >
            {item.rotulo}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setSituacao(situacao === 'ABERTAS' ? 'TODAS' : 'ABERTAS')}
          aria-pressed={situacao === 'TODAS'}
          className={cn(
            'ml-auto min-h-11 rounded-full border px-4 text-sm transition-colors',
            situacao === 'TODAS'
              ? 'border-destaque bg-destaque-suave font-medium text-destaque hover:opacity-90'
              : 'border-borda text-texto-suave hover:bg-superficie-2 hover:text-texto',
          )}
        >
          Incluir quitadas
        </button>
      </div>

      {relatorio.isLoading && <Carregando linhas={4} />}
      {relatorio.isError && (
        <Erro
          mensagem="Não foi possível carregar o relatório"
          aoTentarDeNovo={() => relatorio.refetch()}
        />
      )}

      {relatorio.data && (
        <>
          {/* O saldo só existe quando os dois lados foram consultados */}
          {relatorio.data.saldo !== null && (
            <Cartao className="flex flex-col gap-1 p-5">
              <p className="text-sm text-texto-suave">Saldo final</p>
              <Valor valor={relatorio.data.saldo} tom="automatico" tamanho="grande" />
            </Cartao>
          )}

          {relatorio.data.aPagar && (
            <Bloco
              titulo="A pagar"
              total={relatorio.data.aPagar.total}
              tom="negativo"
              itens={relatorio.data.aPagar.itens}
              colunas={colunas}
            />
          )}

          {relatorio.data.aReceber && (
            <Bloco
              titulo="A receber"
              total={relatorio.data.aReceber.total}
              tom="positivo"
              itens={relatorio.data.aReceber.itens}
              colunas={colunas}
            />
          )}
        </>
      )}
    </>
  );
}

function Bloco({
  titulo,
  total,
  tom,
  itens,
  colunas,
}: {
  titulo: string;
  total: string;
  tom: 'positivo' | 'negativo';
  itens: ItemDoRelatorio[];
  colunas: ColunaDaLista<ItemDoRelatorio>[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        <Valor valor={total} tom={tom} />
      </div>

      {itens.length === 0 ? (
        <Vazio titulo="Nada por aqui" descricao="Não há nada em aberto neste modo." />
      ) : (
        <ListaDeDados itens={itens} colunas={colunas} chaveDoItem={(item) => item.id} />
      )}
    </section>
  );
}
