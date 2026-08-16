import { useQuery } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { ROTULO_DA_DIRECAO, type Direcao, type Lancamento } from '@controle/shared';
import { api } from '@/lib/api';
import { cn, deslocarMes, formatarMes, mesAtual } from '@/lib/utils';
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
 * Contas a receber e a pagar.
 *
 * É a mesma tela com a direção trocada: as duas listas têm a mesma estrutura, as mesmas
 * ações e a mesma leitura. Duplicar o arquivo faria a correção de um lado esquecer o outro.
 */
export function Contas({ direcao }: { direcao: Direcao }) {
  const [mes, setMes] = useState(mesAtual());
  const [situacao, setSituacao] = useState<Situacao>('ABERTAS');
  const [lancando, setLancando] = useState(false);

  const lancamentos = useQuery({
    queryKey: ['lancamentos', direcao, mes, situacao],
    queryFn: () =>
      api.get<Lancamento[]>(`/lancamentos?direcao=${direcao}&mes=${mes}&situacao=${situacao}`),
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

      <div className="flex flex-wrap gap-2">
        {SITUACOES.map((item) => (
          <button
            key={item.valor}
            type="button"
            onClick={() => setSituacao(item.valor)}
            aria-pressed={situacao === item.valor}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm transition-colors',
              situacao === item.valor
                ? 'border-destaque bg-destaque-suave font-medium text-destaque hover:opacity-90'
                : 'border-borda text-texto-suave hover:bg-superficie-2 hover:text-texto',
            )}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {lancamentos.isLoading && <Carregando linhas={4} />}
      {lancamentos.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => lancamentos.refetch()} />
      )}

      {lancamentos.data?.length === 0 && (
        <Vazio
          titulo={`Nada ${situacao === 'BAIXADAS' ? 'baixado' : 'em aberto'} em ${formatarMes(mes)}`}
          descricao={
            ehEntrada
              ? 'Lance o que você tem a receber neste mês.'
              : 'Lance o que você tem a pagar neste mês.'
          }
          acao={<Button onClick={() => setLancando(true)}>Lançar</Button>}
        />
      )}

      {lancamentos.data && lancamentos.data.length > 0 && (
        <ListaDeLancamentos itens={lancamentos.data} />
      )}

      <PainelDeLancamento aberto={lancando} aoFechar={() => setLancando(false)} direcao={direcao} />
    </>
  );
}

export function ContasAReceber() {
  return <Contas direcao="RECEIVABLE" />;
}

export function ContasAPagar() {
  return <Contas direcao="PAYABLE" />;
}
