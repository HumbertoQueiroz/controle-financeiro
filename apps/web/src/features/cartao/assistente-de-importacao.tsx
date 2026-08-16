import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Warning } from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import type { Cartao, PreviaDaImportacao, ResultadoDaImportacao } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao as CartaoUi } from '@/components/ui/cartao';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';
import { SeletorDeResponsavel } from './seletor-de-responsavel';
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
}: {
  aberto: boolean;
  aoFechar: () => void;
  cartoes: Cartao[];
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
  const cartaoId = escolhido || (cartoes[0]?.id ?? '');
  const setCartaoId = setEscolhido;
  const [mes, setMes] = useState(mesAtual());
  const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [responsaveis, setResponsaveis] = useState<Record<string, string | null>>({});
  const [faturas, setFaturas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [divergenciaAceita, setDivergenciaAceita] = useState(false);

  const reiniciar = () => {
    setEtapa('arquivo');
    setEscolhido('');
    setPrevia(null);
    setResultado(null);
    setResponsaveis({});
    setFaturas({});
    setErro(null);
    setDivergenciaAceita(false);
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
    mutationFn: (aceitarDivergencia: boolean) => {
      const classificar = (linha: PreviaDaImportacao['lancamentos'][number]) => ({
        chave: linha.chave,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        fatura: faturas[linha.chave] ?? linha.faturaSugerida,
        responsavelPessoaId: responsaveis[linha.chave] ?? null,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
      });

      return api.post<ResultadoDaImportacao>(`/cartoes/${cartaoId}/importacoes`, {
        nomeDoArquivo: referenciaDoArquivo.current?.files?.[0]?.name ?? 'fatura.csv',
        mesSelecionado: mes,
        lancamentos: previa!.lancamentos.map(classificar),
        novosParcelamentos: previa!.novosParcelamentos.map(classificar),
        pagamentos: previa!.pagamentos.map((linha) => ({
          chave: linha.chave,
          data: linha.data,
          descricao: linha.descricao,
          valor: linha.valor,
          fatura: linha.faturaSugerida,
        })),
        divergenciaAceita: aceitarDivergencia,
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
      // A recusa por divergência é a única que oferece "confirmar mesmo assim": as demais
      // são erro de dado, e insistir não resolveria.
      if (mensagem.includes('Confirme para prosseguir')) setDivergenciaAceita(true);
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
    formulario.append('arquivo', arquivo);
    analisar.mutate(formulario);
  };

  const titulos: Record<Etapa, string> = {
    arquivo: 'Importar fatura',
    classificar: 'Conferir e classificar',
    resultado: 'Importação concluída',
  };

  return (
    <Painel
      aberto={aberto}
      aoFechar={fechar}
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
            auxilio="Se o arquivo indicar outro mês, avisamos antes de gravar."
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
        <div className="flex flex-col gap-6">
          <Secao
            titulo="Lançamentos"
            descricao="O padrão é seu. Marque o que for de outra pessoa."
            vazio="Nenhuma compra avulsa neste arquivo."
            quantidade={previa.lancamentos.length}
          >
            {previa.lancamentos.map((linha) => (
              <LinhaClassificavel
                key={linha.chave}
                linha={linha}
                mes={mes}
                fatura={faturas[linha.chave] ?? linha.faturaSugerida}
                responsavel={responsaveis[linha.chave] ?? null}
                aoTrocarFatura={(valor) =>
                  setFaturas((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarResponsavel={(valor) =>
                  setResponsaveis((atual) => ({ ...atual, [linha.chave]: valor }))
                }
              />
            ))}
          </Secao>

          <Secao
            titulo="Novo parcelamento"
            descricao="As parcelas seguintes serão criadas nas próximas faturas."
            vazio="Nenhuma compra parcelada nova."
            quantidade={previa.novosParcelamentos.length}
          >
            {previa.novosParcelamentos.map((linha) => (
              <LinhaClassificavel
                key={linha.chave}
                linha={linha}
                mes={mes}
                fatura={faturas[linha.chave] ?? linha.faturaSugerida}
                responsavel={responsaveis[linha.chave] ?? null}
                aoTrocarFatura={(valor) =>
                  setFaturas((atual) => ({ ...atual, [linha.chave]: valor }))
                }
                aoTrocarResponsavel={(valor) =>
                  setResponsaveis((atual) => ({ ...atual, [linha.chave]: valor }))
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
          >
            {previa.parcelamentosAnteriores.map((linha) => (
              <CartaoUi
                key={linha.parcelamentoId + linha.parcelaNumero}
                className="flex items-center justify-between gap-3 p-3 opacity-70"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-sm text-texto">{linha.descricao}</p>
                  <p className="text-xs text-texto-suave">
                    Parcela {linha.parcelaNumero} de {linha.parcelaTotal} · fatura{' '}
                    {formatarMes(linha.faturaDaParcela)}
                    {linha.responsavel ? ` · ${linha.responsavel}` : ''}
                  </p>
                </div>

                <Valor valor={linha.valor} />
              </CartaoUi>
            ))}
          </Secao>

          {previa.pagamentos.length > 0 && (
            <Secao
              titulo="Pagamentos da fatura"
              descricao="Registrados apenas se a fatura estiver em aberto."
              vazio=""
              quantidade={previa.pagamentos.length}
            >
              {previa.pagamentos.map((linha) => (
                <CartaoUi key={linha.chave} className="flex items-center justify-between gap-3 p-3">
                  <p className="truncate text-sm text-texto">{linha.descricao}</p>
                  <Valor valor={linha.valor} tom="positivo" />
                </CartaoUi>
              ))}
            </Secao>
          )}

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

            <Button
              onClick={() => confirmar.mutate(divergenciaAceita)}
              disabled={confirmar.isPending}
            >
              {confirmar.isPending
                ? 'Gravando…'
                : divergenciaAceita
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
            {resultado.pagamentosIgnorados > 0 && (
              <Linha
                rotulo="Pagamentos ignorados"
                valor={`${resultado.pagamentosIgnorados} (fatura não estava em aberto)`}
              />
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-texto">Faturas afetadas</p>

            {resultado.faturasAfetadas.map((fatura) => (
              <div key={fatura.faturaId} className="flex items-center justify-between gap-3">
                <span className="text-sm capitalize text-texto-suave">
                  {formatarMes(fatura.mes)}
                </span>
                <Valor valor={fatura.total} />
              </div>
            ))}
          </div>

          <Button largura="cheia" onClick={fechar}>
            Fechar
          </Button>
        </div>
      )}
    </Painel>
  );
}

function Secao({
  titulo,
  descricao,
  vazio,
  quantidade,
  children,
}: {
  titulo: string;
  descricao: string;
  vazio: string;
  quantidade: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-texto">
          {titulo}
          {quantidade > 0 && (
            <span className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-normal text-texto-suave">
              {quantidade}
            </span>
          )}
        </h3>
        <p className="text-xs text-texto-suave">{descricao}</p>
      </div>

      {quantidade === 0 ? (
        vazio && <p className="text-xs text-texto-suave">{vazio}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}

function LinhaClassificavel({
  linha,
  mes,
  fatura,
  responsavel,
  aoTrocarFatura,
  aoTrocarResponsavel,
  detalhe,
}: {
  linha: { chave: string; data: string | Date; descricao: string; valor: string };
  mes: string;
  fatura: string;
  responsavel: string | null;
  aoTrocarFatura: (valor: string) => void;
  aoTrocarResponsavel: (valor: string | null) => void;
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
          <SeletorDeResponsavel
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
            className={divergente ? 'border-atencao text-xs' : 'text-xs'}
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
      </div>
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
