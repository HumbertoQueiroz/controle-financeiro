import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Warning } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { Orcamento as TipoDeOrcamento } from '@controle/shared';
import { api } from '@/lib/api';
import { useParametroDaUrl } from '@/lib/url';
import { deslocarMes, mesAtual } from '@/lib/utils';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro } from '@/components/ui/estados';
import { Valor } from '@/components/ui/valor';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { ListaDeLancamentos } from '@/features/lancamentos/lista-de-lancamentos';

/**
 * Orçamento do mês, item a item.
 *
 * Reúne o que entra e o que sai, separando o que já teve baixa do que segue em aberto. O
 * dashboard responde "como está este mês?" em três números; esta tela é onde se confere
 * lançamento por lançamento de onde esses números vieram.
 *
 * O mês é delimitado pelo **vencimento**. Uma conta de agosto paga em setembro pertence ao
 * orçamento de agosto — foi ali que ela foi assumida —, e o que a baixa responde é outra
 * coisa: quanto de fato se moveu. As duas leituras aparecem lado a lado.
 */
export function Orcamento() {
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());

  const orcamento = useQuery({
    queryKey: ['orcamento', mes],
    queryFn: () => api.get<TipoDeOrcamento>(`/orcamento?mes=${mes}`),
  });

  return (
    <>
      <TituloDaSecao
        titulo="Orçamento do mês"
        descricao="Tudo que vence neste mês, com baixa ou sem."
      />

      <SeletorDeMes
        mes={mes}
        aoVoltar={() => setMes(deslocarMes(mes, -1))}
        aoAvancar={() => setMes(deslocarMes(mes, 1))}
      />

      {orcamento.isLoading && <Carregando linhas={5} />}
      {orcamento.isError && (
        <Erro
          mensagem="Não foi possível carregar o mês"
          aoTentarDeNovo={() => orcamento.refetch()}
        />
      )}

      {orcamento.data && (
        <>
          {/* Dois saldos: o do mês inteiro e o do que já aconteceu. Mostrar só um
              esconderia metade da resposta. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Cartao className="flex flex-1 flex-col gap-1 p-5">
              <p className="text-sm text-texto-suave">Saldo previsto</p>
              <Valor valor={orcamento.data.saldoPrevisto} tom="automatico" tamanho="grande" />
              <p className="text-xs text-texto-suave">Considerando tudo que vence no mês</p>
            </Cartao>

            <Cartao className="flex flex-1 flex-col gap-1 p-5">
              <p className="text-sm text-texto-suave">Saldo realizado</p>
              <Valor valor={orcamento.data.saldoRealizado} tom="automatico" tamanho="grande" />
              <p className="text-xs text-texto-suave">Só o que já entrou e saiu</p>
            </Cartao>
          </div>

          {/* O hover fica no link, não no cartão: quem passa o ponteiro pela borda precisa
              ver a reação da área que de fato é clicável. */}
          {orcamento.data.atrasados > 0 && (
            <Link to="/app/a-pagar" className="block transition-opacity hover:opacity-80">
              <Cartao className="flex items-center gap-3 border-negativo/40 bg-negativo-suave p-4">
                <Warning size={20} className="shrink-0 text-negativo" aria-hidden />
                <p className="text-sm text-texto">
                  {orcamento.data.atrasados} lançamento(s) venceram e seguem sem baixa
                </p>
              </Cartao>
            </Link>
          )}

          <Bloco
            titulo="Entradas"
            Icone={ArrowUp}
            tom="positivo"
            bloco={orcamento.data.entradas}
            para="/app/a-receber"
          />

          <Bloco
            titulo="Saídas"
            Icone={ArrowDown}
            tom="negativo"
            bloco={orcamento.data.saidas}
            para="/app/a-pagar"
          />
        </>
      )}
    </>
  );
}

function Bloco({
  titulo,
  Icone,
  tom,
  bloco,
  para,
}: {
  titulo: string;
  Icone: typeof ArrowUp;
  tom: 'positivo' | 'negativo';
  bloco: TipoDeOrcamento['entradas'];
  para: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
          <Icone
            size={18}
            className={tom === 'positivo' ? 'text-positivo' : 'text-negativo'}
            aria-hidden
          />
          {titulo}
        </h2>

        <Link
          to={para}
          className="min-h-11 rounded-padrao px-2 py-2 text-sm text-destaque transition-colors hover:bg-superficie-2"
        >
          Ver todas
        </Link>
      </div>

      <Cartao className="flex flex-col gap-2 p-4">
        <Linha rotulo="Previsto" valor={bloco.previsto} tom="neutro" />
        <Linha rotulo="Já realizado" valor={bloco.realizado} tom={tom} />
        <Linha rotulo="Em aberto" valor={bloco.emAberto} tom="neutro" />
      </Cartao>

      {bloco.itens.length > 0 && <ListaDeLancamentos itens={bloco.itens} />}
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: string;
  tom: 'neutro' | 'positivo' | 'negativo';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-texto-suave">{rotulo}</span>
      <Valor valor={valor} tom={tom} />
    </div>
  );
}
