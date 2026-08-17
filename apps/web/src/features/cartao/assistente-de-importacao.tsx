import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretRight, Warning } from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import type {
  AcaoDoPagamento,
  Cartao,
  PagamentoDaPrevia,
  PreviaDaImportacao,
  ResultadoDaImportacao,
} from '@controle/shared';
import { deCentavos, formatarValor, paraCentavos, somarCentavos } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao as CartaoUi } from '@/components/ui/cartao';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';
import { SeletorDeCategoria } from '@/features/categorias/seletor-de-categoria';
import { SeletorDePessoa } from '@/features/pessoas/seletor-de-pessoa';
import { SeletorDeCartao } from './seletor-de-cartao';

type Etapa = 'arquivo' | 'classificar' | 'resultado';

/** Meses ao redor do escolhido, para corrigir a fatura de um lançamento específico. */
function mesesVizinhos(mes: string): string[] {
  const [ano, numero] = mes.split('-').map(Number);

  return [-2, -1, 0, 1, 2].map((passo) => {
    const data = new Date(Date.UTC(ano!, numero! - 1 + passo, 1));

    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Importação da fatura, em duas etapas.
 *
 * A primeira lê o arquivo e não grava nada; a segunda grava o que a pessoa classificou.
 * Gravar antes de perguntar deixaria lançamento errado no sistema no intervalo — e o gasto
 * do outro participante entraria como se fosse seu.
 */
export function AssistenteDeImportacao({
  aberto,
  aoFechar,
  cartoes,
  cartaoInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  cartoes: Cartao[];
  /** O cartão da tela de onde a importação foi aberta. */
  cartaoInicial?: string;
}) {
  const clienteDeQuery = useQueryClient();
  const referenciaDoArquivo = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [escolhido, setEscolhido] = useState<string>('');

  /**
   * O cartão escolhido, ou o primeiro da lista.
   *
   * Derivado em vez de guardado no estado inicial: a lista chega depois da primeira
   * renderização, e um `useState(cartoes[0]?.id)` congelaria o valor vazio — o select
   * mostraria o cartão e o botão continuaria desabilitado, sem explicação na tela.
   */
  const cartaoId = escolhido || cartaoInicial || (cartoes[0]?.id ?? '');
  const setCartaoId = setEscolhido;
  const [mes, setMes] = useState(mesAtual());
  const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [responsaveis, setResponsaveis] = useState<Record<string, string | null>>({});
  const [faturas, setFaturas] = useState<Record<string, string>>({});
  const [acoes, setAcoes] = useState<Record<string, AcaoDoPagamento>>({});
  const [categoriaDaLinha, setCategoriaDaLinha] = useState<Record<string, string | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [divergenciaAceita, setDivergenciaAceita] = useState(false);
  const [excedenteAceito, setExcedenteAceito] = useState(false);

  const reiniciar = () => {
    setEtapa('arquivo');
    setEscolhido('');
    setPrevia(null);
    setResultado(null);
    setResponsaveis({});
    setFaturas({});
    setAcoes({});
    setCategoriaDaLinha({});
    setErro(null);
    setDivergenciaAceita(false);
    setExcedenteAceito(false);
  };

  const fechar = () => {
    reiniciar();
    aoFechar();
  };

  const analisar = useMutation({
    mutationFn: (formulario: FormData) =>
      api.enviarArquivo<PreviaDaImportacao>(`/cartoes/${cartaoId}/importacoes/previa`, formulario),
    onSuccess: (dados) => {
      setErro(null);
      setPrevia(dados);
      setFaturas(
        Object.fromEntries(
          [...dados.lancamentos, ...dados.novosParcelamentos].map((linha) => [
            linha.chave,
            linha.faturaSugerida,
          ]),
        ),
      );
      setEtapa('classificar');
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível ler'),
  });

  const confirmar = useMutation({
    mutationFn: () => {
      const classificar = (linha: PreviaDaImportacao['lancamentos'][number]) => ({
        chave: linha.chave,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        fatura: faturas[linha.chave] ?? linha.faturaSugerida,
        responsavelPessoaId: responsaveis[linha.chave] ?? null,
        categoriaId: categoriaDaLinha[linha.chave] ?? linha.categoriaSugerida,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
        ocorrencia: linha.ocorrencia,
      });

      return api.post<ResultadoDaImportacao>(`/cartoes/${cartaoId}/importacoes`, {
        nomeDoArquivo: referenciaDoArquivo.current?.files?.[0]?.name ?? 'fatura.csv',
        mesSelecionado: mes,
        // Os já conhecidos vão junto: o banco os descarta pelo único de (fatura, hash), e
        // é o que mantém o contador de "já existiam" dizendo a verdade. Separá-los aqui
        // faria a tela e a gravação usarem critérios diferentes para a mesma pergunta.
        lancamentos: [...previa!.lancamentos, ...previa!.lancamentosConhecidos].map(classificar),
        novosParcelamentos: previa!.novosParcelamentos.map(classificar),
        pagamentos: previa!.pagamentos.map((linha) => ({
          chave: linha.chave,
          data: linha.data,
          descricao: linha.descricao,
          valor: linha.valor,
          fatura: linha.faturaSugerida,
          acao: acoes[linha.chave] ?? linha.acaoSugerida,
        })),
        divergenciaAceita,
        excedenteAceito,
      });
    },
    onSuccess: async (dados) => {
      setErro(null);
      setResultado(dados);
      setEtapa('resultado');
      await Promise.all([
        clienteDeQuery.invalidateQueries({ queryKey: ['faturas'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['cartoes'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['parcelamentos'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
      ]);
    },
    onError: (falha) => {
      const mensagem = falha instanceof Error ? falha.message : 'Não foi possível importar';

      setErro(mensagem);

      // Só os dois alertas de conferência oferecem "confirmar mesmo assim"; as demais
      // recusas são erro de dado, e insistir não resolveria. Cada um libera o **seu** flag:
      // aceitar os dois de uma vez faria o alerta que a pessoa nunca viu passar junto.
      if (mensagem.includes('maior que o saldo em aberto')) setExcedenteAceito(true);
      else if (mensagem.includes('Confirme para prosseguir')) setDivergenciaAceita(true);
    },
  });

  const aoEnviarArquivo = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const arquivo = referenciaDoArquivo.current?.files?.[0];

    if (!arquivo) {
      setErro('Escolha o arquivo CSV da fatura');
      return;
    }

    const formulario = new FormData();
    // O mês vai antes do arquivo: o servidor lê os campos na ordem em que chegam, e o
    // arquivo é o último a ser consumido.
    formulario.append('mes', mes);
    formulario.append('arquivo', arquivo);
    analisar.mutate(formulario);
  };

  /**
   * A categoria da linha: a escolha da pessoa, ou a sugestão de um gasto igual já
   * classificado. `null` explícito é "sem categoria", e por isso o `??` não serve — ele
   * traria a sugestão de volta depois de a pessoa tê-la tirado.
   */
  const categoriaDe = (linha: { chave: string; categoriaSugerida: string | null }) =>
    linha.chave in categoriaDaLinha ? categoriaDaLinha[linha.chave]! : linha.categoriaSugerida;

  const titulos: Record<Etapa, string> = {
    arquivo: 'Importar fatura',
    classificar: 'Conferir e classificar',
    resultado: 'Importação concluída',
  };

  return (
    <Painel
      aberto={aberto}
      aoFechar={fechar}
      // A classificação tem colunas próprias — descrição, valor, quem paga e qual fatura.
      // Na largura de formulário, cada seletor fica com metade de meia coluna.
      largura={etapa === 'classificar' ? 'largo' : 'estreito'}
      titulo={titulos[etapa]}
      descricao={
        etapa === 'arquivo'
          ? 'Escolha o cartão e o arquivo. Nada é gravado antes de você conferir.'
          : etapa === 'classificar'
            ? 'Diga de quem é cada gasto e em qual fatura ele entra.'
            : undefined
      }
    >
      {etapa === 'arquivo' && (
        <form onSubmit={aoEnviarArquivo} className="flex flex-col gap-4">
          <SeletorDeCartao cartoes={cartoes} valor={cartaoId} aoMudar={setCartaoId} />

          <Campo
            rotulo="Mês da fatura"
            auxilio="Todos os lançamentos do arquivo entram nesta fatura."
          >
            {(id) => (
              <Input
                id={id}
                type="month"
                value={mes}
                onChange={(evento) => setMes(evento.target.value)}
                required
              />
            )}
          </Campo>

          <Campo rotulo="Arquivo CSV" auxilio="O arquivo que você baixou do seu banco.">
            {(id) => (
              <input
                id={id}
                ref={referenciaDoArquivo}
                type="file"
                accept=".csv,text/csv"
                required
                className="min-h-11 w-full rounded-padrao border border-borda bg-superficie px-3 py-2 text-sm text-texto transition-colors hover:bg-superficie-2 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-2 file:px-3 file:py-1.5 file:text-sm file:text-texto"
              />
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={analisar.isPending || !cartaoId}>
            {analisar.isPending ? 'Lendo…' : 'Continuar'}
          </Button>
        </form>
      )}

      {etapa === 'classificar' && previa && (
        <div className="flex flex-col gap-4">
          <Secao
            titulo="Novos lançamentos"
            descricao="Marque o que for de outra pessoa e em que se gastou."
            vazio="Nenhuma compra avulsa nova neste arquivo."
            quantidade={previa.lancamentos.length}
            total={somar(previa.lancamentos)}
            padraoAberto
          >
            {previa.lancamentos.map((linha) => (
              <LinhaClassificavel
                key={linha.chave}
                linha={linha}
                mes={mes}
                fatura={faturas[linha.chave] ?? linha.faturaSugerida}
                responsavel={responsaveis[linha.chave] ?? null}
                categoria={categoriaDe(linha)}
                aoTrocarFatura={(valor) =>
                  setFaturas((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarResponsavel={(valor) =>
                  setResponsaveis((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarCategoria={(valor) =>
                  setCategoriaDaLinha((atual) => ({ ...atual, [linha.chave]: valor }))
                }
              />
            ))}
          </Secao>

          <Secao
            titulo="Já importados antes"
            descricao="Estas linhas já estão nesta fatura. Não serão duplicadas."
            vazio="Nenhuma."
            quantidade={previa.lancamentosConhecidos.length}
            total={somar(previa.lancamentosConhecidos)}
          >
            {previa.lancamentosConhecidos.map((linha) => (
              <LinhaSimples
                key={linha.chave}
                descricao={linha.descricao}
                detalhe={formatarData(linha.data)}
                valor={linha.valor}
              />
            ))}
          </Secao>

          <Secao
            titulo="Novos parcelamentos"
            descricao="As parcelas seguintes serão criadas nas próximas faturas."
            vazio="Nenhuma compra parcelada nova."
            quantidade={previa.novosParcelamentos.length}
            total={somar(previa.novosParcelamentos)}
            padraoAberto
          >
            {previa.novosParcelamentos.map((linha) => (
              <LinhaClassificavel
                key={linha.chave}
                linha={linha}
                mes={mes}
                fatura={faturas[linha.chave] ?? linha.faturaSugerida}
                responsavel={responsaveis[linha.chave] ?? null}
                categoria={categoriaDe(linha)}
                aoTrocarFatura={(valor) =>
                  setFaturas((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarResponsavel={(valor) =>
                  setResponsaveis((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarCategoria={(valor) =>
                  setCategoriaDaLinha((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                detalhe={`Parcela ${linha.parcelaNumero} de ${linha.parcelaTotal} · gera ${linha.mesesDasParcelas.length} parcela(s)`}
              />
            ))}
          </Secao>

          <Secao
            titulo="Parcelamentos anteriores"
            descricao="Já lançados numa importação passada. Não serão duplicados."
            vazio="Nenhum."
            quantidade={previa.parcelamentosAnteriores.length}
            total={somar(previa.parcelamentosAnteriores)}
          >
            {previa.parcelamentosAnteriores.map((linha) => (
              <LinhaSimples
                key={linha.parcelamentoId + linha.parcelaNumero}
                descricao={linha.descricao}
                detalhe={`Parcela ${linha.parcelaNumero} de ${linha.parcelaTotal} · fatura ${formatarMes(linha.faturaDaParcela)}${linha.responsavel ? ` · ${linha.responsavel}` : ''}`}
                valor={linha.valor}
              />
            ))}
          </Secao>

          {previa.pagamentos.length > 0 && (
            <Secao
              titulo="Pagamento da fatura anterior"
              descricao="O pagamento que aparece neste extrato quitou a fatura do mês passado."
              vazio=""
              quantidade={previa.pagamentos.length}
              total={somar(previa.pagamentos)}
              padraoAberto
            >
              {previa.pagamentos.map((linha) => (
                <LinhaDePagamento
                  key={linha.chave}
                  linha={linha}
                  acao={acoes[linha.chave] ?? linha.acaoSugerida}
                  aoTrocarAcao={(valor) =>
                    setAcoes((atual) => ({ ...atual, [linha.chave]: valor }))
                  }
                />
              ))}
            </Secao>
          )}

          <Resumo previa={previa} mes={mes} />

          {erro && (
            <CartaoUi className="flex items-start gap-3 border-atencao/40 bg-superficie-2 p-4">
              <Warning size={20} className="mt-0.5 shrink-0 text-atencao" aria-hidden />
              <p role="alert" className="text-sm text-texto">
                {erro}
              </p>
            </CartaoUi>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variante="secundaria" onClick={() => setEtapa('arquivo')}>
              Voltar
            </Button>

            <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
              {confirmar.isPending
                ? 'Gravando…'
                : divergenciaAceita || excedenteAceito
                  ? 'Confirmar mesmo assim'
                  : 'Confirmar importação'}
            </Button>
          </div>
        </div>
      )}

      {etapa === 'resultado' && resultado && (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2">
            <Linha rotulo="Lançamentos novos" valor={String(resultado.lancamentosInseridos)} />
            <Linha
              rotulo="Já existiam (não duplicados)"
              valor={String(resultado.lancamentosIgnorados)}
            />
            {resultado.parcelamentosCriados > 0 && (
              <Linha
                rotulo="Parcelamentos criados"
                valor={`${resultado.parcelamentosCriados} (${resultado.parcelasGeradas} parcelas)`}
              />
            )}
            <Linha
              rotulo="Pagamentos registrados"
              valor={String(resultado.pagamentosRegistrados)}
            />
            {resultado.saldosAnterioresCriados > 0 && (
              <Linha
                rotulo="Faturas anteriores criadas"
                valor={String(resultado.saldosAnterioresCriados)}
              />
            )}
            {resultado.pagamentosIgnorados > 0 && (
              <Linha rotulo="Pagamentos ignorados" valor={String(resultado.pagamentosIgnorados)} />
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-texto">Faturas afetadas</p>

            {resultado.faturasAfetadas.map((fatura) => (
              <div key={fatura.faturaId} className="flex items-center justify-between gap-3">
                <span className="text-sm text-texto-suave first-letter:uppercase">
                  {formatarMes(fatura.mes)}
                </span>
                <Valor valor={fatura.total} />
              </div>
            ))}
          </div>

          {/* Respiro antes do botão: colado no último número, ele parece parte da lista e
              vira alvo de toque acidental de quem só ia conferir o total. */}
          <Button largura="cheia" className="mt-4" onClick={fechar}>
            Fechar
          </Button>
        </div>
      )}
    </Painel>
  );
}

/**
 * Uma seção da conferência, que abre e fecha.
 *
 * O que **exige decisão** nasce aberto; o que é só informação nasce fechado. Um extrato de
 * trinta linhas com tudo aberto empurra o botão de confirmar para fora da tela, e o que
 * precisa de atenção se perde no meio do que já está resolvido.
 *
 * Fechada, ela continua dizendo quantas linhas e quanto somam — que é a informação pela
 * qual alguém abriria.
 */
function Secao({
  titulo,
  descricao,
  vazio,
  quantidade,
  total,
  padraoAberto = false,
  children,
}: {
  titulo: string;
  descricao: string;
  vazio: string;
  quantidade: number;
  total?: string;
  padraoAberto?: boolean;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(padraoAberto);

  return (
    // Três tons empilhados: o painel, a seção um passo acima e os cartões de volta ao tom
    // do painel. Sem a diferença, a seção some no fundo e a lista vira um bloco só — que é
    // o oposto do motivo de as seções existirem.
    <section className="flex flex-col gap-2 rounded-padrao border border-borda bg-superficie-2 p-3">
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        disabled={quantidade === 0}
        className="flex min-h-11 items-center gap-3 rounded-padrao text-left transition-colors hover:text-texto disabled:cursor-default"
      >
        <CaretRight
          size={16}
          aria-hidden
          className={`shrink-0 text-texto-suave transition-transform ${aberta ? 'rotate-90' : ''} ${
            quantidade === 0 ? 'opacity-0' : ''
          }`}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-texto">
            {titulo}
            {quantidade > 0 && (
              <span className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-normal text-texto-suave">
                {quantidade}
              </span>
            )}
          </span>
          <span className="text-xs text-texto-suave">{descricao}</span>
        </span>

        {quantidade > 0 && total && <Valor valor={total} />}
      </button>

      {quantidade === 0
        ? vazio && <p className="pl-7 text-xs text-texto-suave">{vazio}</p>
        : aberta && <div className="flex flex-col gap-2 pl-7">{children}</div>}
    </section>
  );
}

/** Uma linha que só informa: já importada, ou parcela de compra já conhecida. */
function LinhaSimples({
  descricao,
  detalhe,
  valor,
}: {
  descricao: string;
  detalhe: string;
  valor: string;
}) {
  return (
    <CartaoUi className="flex items-center justify-between gap-3 p-3 opacity-70">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-sm text-texto">{descricao}</p>
        <p className="text-xs text-texto-suave">{detalhe}</p>
      </div>

      <Valor valor={valor} />
    </CartaoUi>
  );
}

/**
 * O fecho da conferência: quanto cada seção soma e quanto a fatura vai ficar.
 *
 * O total é a conta que se faz olhando o extrato do banco ao lado. Sem ele, a única forma
 * de saber se a importação bate é confirmar e conferir depois — quando corrigir já custa
 * apagar lançamento.
 */
function Resumo({ previa, mes }: { previa: PreviaDaImportacao; mes: string }) {
  const novos = somar(previa.lancamentos);
  const conhecidos = somar(previa.lancamentosConhecidos);
  const parcelamentos = somar(previa.novosParcelamentos);

  // Só as parcelas anteriores **deste mês** entram: as dos outros meses estão em outras
  // faturas, e somá-las aqui daria um total que não bate com o extrato nenhum.
  const parcelasDoMes = somar(
    previa.parcelamentosAnteriores.filter((linha) => linha.faturaDaParcela === mes),
  );

  const totalDaFatura = deCentavos(
    somarCentavos([novos, conhecidos, parcelamentos, parcelasDoMes].map(paraCentavos)),
  );

  return (
    <section className="flex flex-col gap-2 rounded-padrao border border-borda bg-superficie-2 p-3">
      <h3 className="text-sm font-semibold text-texto">Resumo</h3>

      <dl className="flex flex-col gap-1">
        <LinhaDoResumo rotulo="Novos lançamentos" valor={novos} />
        <LinhaDoResumo rotulo="Já importados antes" valor={conhecidos} />
        <LinhaDoResumo rotulo="Novos parcelamentos" valor={parcelamentos} />
        <LinhaDoResumo
          rotulo={`Parcelas anteriores de ${formatarMes(mes)}`}
          valor={parcelasDoMes}
        />
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-borda pt-2">
        <span className="text-sm font-semibold text-texto">
          Total da fatura de <span className="first-letter:uppercase">{formatarMes(mes)}</span>
        </span>
        <Valor valor={totalDaFatura} />
      </div>

      {previa.pagamentos.length > 0 && (
        // Fora do total de propósito: o pagamento quita a fatura anterior, e somá-lo aqui
        // daria um número que não existe em extrato nenhum.
        <p className="text-xs text-texto-suave">
          O pagamento de {formatarValor(somar(previa.pagamentos))} não entra neste total: ele é da
          fatura anterior.
        </p>
      )}
    </section>
  );
}

function LinhaDoResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-texto-suave first-letter:uppercase">{rotulo}</dt>
      <dd className="text-sm tabular-nums text-texto-suave">{formatarValor(valor)}</dd>
    </div>
  );
}

/** Soma os valores de um grupo de linhas da prévia. */
function somar(linhas: { valor: string }[]): string {
  return deCentavos(somarCentavos(linhas.map((linha) => paraCentavos(linha.valor))));
}

function LinhaClassificavel({
  linha,
  mes,
  fatura,
  responsavel,
  categoria,
  aoTrocarFatura,
  aoTrocarResponsavel,
  aoTrocarCategoria,
  detalhe,
}: {
  linha: { chave: string; data: string | Date; descricao: string; valor: string };
  mes: string;
  fatura: string;
  responsavel: string | null;
  categoria: string | null;
  aoTrocarFatura: (valor: string) => void;
  aoTrocarResponsavel: (valor: string | null) => void;
  aoTrocarCategoria: (valor: string | null) => void;
  detalhe?: string;
}) {
  const divergente = fatura !== mes;

  return (
    <CartaoUi className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium text-texto">{linha.descricao}</p>
          <p className="text-xs text-texto-suave">
            {formatarData(linha.data)}
            {detalhe ? ` · ${detalhe}` : ''}
          </p>
        </div>

        <Valor valor={linha.valor} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-texto-suave">Quem paga</span>
          <SeletorDePessoa
            valor={responsavel}
            aoMudar={aoTrocarResponsavel}
            rotulo={`Quem paga ${linha.descricao}`}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-texto-suave">
            Fatura
            {/* A divergência é marcada linha a linha, não só no total: é assim que se
                descobre QUAL compra caiu no mês errado. */}
            {divergente && <span className="ml-1 text-atencao">difere do mês escolhido</span>}
          </span>

          <Select
            aria-label={`Fatura de ${linha.descricao}`}
            value={fatura}
            onChange={(evento) => aoTrocarFatura(evento.target.value)}
            className={divergente ? 'border-atencao' : undefined}
          >
            {mesesVizinhos(mes).map((opcao) => (
              <option key={opcao} value={opcao}>
                {formatarMes(opcao)}
              </option>
            ))}
            {!mesesVizinhos(mes).includes(fatura) && (
              <option value={fatura}>{formatarMes(fatura)}</option>
            )}
          </Select>
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-texto-suave">Categoria</span>

          {/* Classificar aqui, e não depois: é neste momento que se sabe o que a compra
              foi. Duas semanas depois, "PG *IFD" não diz nada a ninguém. */}
          <SeletorDeCategoria
            valor={categoria}
            aoMudar={aoTrocarCategoria}
            rotulo={`Categoria de ${linha.descricao}`}
          />
        </label>
      </div>
    </CartaoUi>
  );
}

/**
 * O pagamento encontrado no extrato, e o que fazer com ele.
 *
 * Ele é a única linha do arquivo que pertence a outro mês: quita a fatura anterior. Na
 * primeira importação de um cartão essa fatura não existe no sistema, e é aí que a escolha
 * importa — ignorar em silêncio some com um valor que a pessoa vê no extrato do banco.
 */
function LinhaDePagamento({
  linha,
  acao,
  aoTrocarAcao,
}: {
  linha: PagamentoDaPrevia;
  acao: AcaoDoPagamento;
  aoTrocarAcao: (valor: AcaoDoPagamento) => void;
}) {
  const mes = formatarMes(linha.faturaSugerida);

  return (
    <CartaoUi className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium text-texto">{linha.descricao}</p>
          <p className="text-xs text-texto-suave">
            {formatarData(linha.data)} · fatura de <span className="capitalize">{mes}</span>
          </p>
        </div>

        <Valor valor={linha.valor} tom="positivo" />
      </div>

      {!linha.faturaExiste && (
        <p className="flex items-start gap-2 text-xs text-atencao">
          <Warning size={14} className="mt-0.5 shrink-0" aria-hidden />A fatura de {mes} não está no
          sistema. É o normal na primeira importação deste cartão.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-suave">O que fazer</span>

        <Select
          aria-label={`O que fazer com ${linha.descricao}`}
          value={acao}
          onChange={(evento) => aoTrocarAcao(evento.target.value as AcaoDoPagamento)}
        >
          <option value="REGISTRAR">Abater da fatura de {mes}</option>
          <option value="IGNORAR">Ignorar este pagamento</option>
          <option value="SALDO_ANTERIOR">Registrar como saldo anterior</option>
        </Select>

        <span className="text-xs text-texto-suave">
          {acao === 'REGISTRAR' &&
            (linha.saldoEmAberto
              ? `Faltam ${formatarValor(linha.saldoEmAberto)} nessa fatura.`
              : 'Só funciona se a fatura existir e estiver em aberto.')}
          {acao === 'IGNORAR' &&
            'Nada é gravado. Escolha certa quando a fatura anterior é de antes de você usar o sistema.'}
          {acao === 'SALDO_ANTERIOR' &&
            `Cria a fatura de ${mes} com um único lançamento deste valor, já quitado. O dinheiro saiu da conta de verdade, mas você não terá o detalhe do que foi gasto.`}
        </span>
      </label>
    </CartaoUi>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borda pb-2 last:border-0">
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd className="text-sm font-medium text-texto">{valor}</dd>
    </div>
  );
}
