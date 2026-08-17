import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowCounterClockwise,
  CaretRight,
  PencilSimple,
  Plus,
  Stack,
} from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Categoria, Direcao, RelatorioPorCategoria } from '@controle/shared';
import { ROTULO_DA_DIRECAO, direcaoSchema, formatarValor } from '@controle/shared';
import { api } from '@/lib/api';
import { useParametroDaUrl } from '@/lib/url';
import { deslocarMes, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { SeletorDeMes } from '@/components/seletor-de-mes';
import { Valor } from '@/components/ui/valor';

/** Paleta de partida. Cores distinguíveis entre si e legíveis nos dois temas. */
const CORES = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

type EmEdicao = Categoria | 'nova' | null;

export function Categorias() {
  const clienteDeQuery = useQueryClient();
  const [mes, setMes] = useParametroDaUrl('mes', mesAtual());
  const [direcaoNaUrl, setDirecao] = useParametroDaUrl('direcao', 'PAYABLE');
  // A URL é texto e pode vir com qualquer coisa; um valor inválido cai no padrão em vez de
  // quebrar a tela de quem colou um link editado à mão.
  const direcao: Direcao = direcaoNaUrl === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';
  const [emEdicao, setEmEdicao] = useState<EmEdicao>(null);
  const [vendoArquivadas, setVendoArquivadas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get<Categoria[]>('/categorias'),
  });

  // As arquivadas em consulta própria, e só quando alguém abre a seção: elas não podem
  // aparecer nas listas de escolha do resto do app, que leem a consulta acima.
  const arquivadas = useQuery({
    queryKey: ['categorias', 'arquivadas'],
    queryFn: () => api.get<Categoria[]>('/categorias?arquivadas=true'),
    enabled: vendoArquivadas,
  });

  const relatorio = useQuery({
    queryKey: ['relatorio-categorias', mes, direcao],
    queryFn: () =>
      api.get<RelatorioPorCategoria>(`/relatorios/categorias?mes=${mes}&direcao=${direcao}`),
  });

  const editando = emEdicao !== null && emEdicao !== 'nova' ? emEdicao : null;

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['categorias'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['relatorio-categorias'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['avisos'] }),
    ]);

  const salvar = useMutation({
    mutationFn: async (dados: {
      nome: string;
      cor?: string;
      direcao?: string;
      limite: string | null;
    }) => {
      const categoria = editando
        ? await api.patch<Categoria>(`/categorias/${editando.id}`, {
            nome: dados.nome,
            cor: dados.cor,
            direcao: dados.direcao,
          })
        : await api.post<Categoria>('/categorias', {
            nome: dados.nome,
            cor: dados.cor,
            direcao: dados.direcao,
          });

      // O limite vai numa chamada própria porque é outro recurso: uma categoria pode ter
      // limites de meses diferentes, e amarrá-lo ao corpo da categoria confundiria "o
      // limite padrão" com "o limite deste mês".
      await api.put(`/categorias/${categoria.id}/limite`, { valor: dados.limite });

      return categoria;
    },
    onSuccess: async () => {
      setEmEdicao(null);
      setErro(null);
      await invalidar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const arquivar = useMutation({
    mutationFn: (id: string) => api.delete(`/categorias/${id}`),
    onSuccess: invalidar,
  });

  const desarquivar = useMutation({
    mutationFn: (id: string) => api.patch(`/categorias/${id}`, { arquivada: false }),
    onSuccess: invalidar,
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const campos = new FormData(evento.currentTarget);
    const limite = String(campos.get('limite') ?? '').trim();
    const lado = String(campos.get('direcao') ?? '');

    salvar.mutate({
      nome: String(campos.get('nome')),
      cor: String(campos.get('cor') ?? '') || undefined,
      direcao: lado || undefined,
      limite: limite || null,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TituloDaSecao
        titulo="Categorias"
        descricao="Onde o dinheiro entra e sai. O limite avisa quando o mês passa do combinado."
        acao={
          <Button onClick={() => setEmEdicao('nova')}>
            <Plus size={18} aria-hidden />
            Nova categoria
          </Button>
        }
      />

      <SeletorDeMes
        mes={mes}
        aoVoltar={() => setMes(deslocarMes(mes, -1))}
        aoAvancar={() => setMes(deslocarMes(mes, 1))}
      />

      <div className="flex gap-2">
        {direcaoSchema.options.map((opcao) => (
          <Button
            key={opcao}
            variante={direcao === opcao ? 'primaria' : 'secundaria'}
            tamanho="pequeno"
            onClick={() => setDirecao(opcao)}
          >
            {ROTULO_DA_DIRECAO[opcao]}
          </Button>
        ))}
      </div>

      {relatorio.isLoading && <Carregando />}
      {relatorio.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => relatorio.refetch()} />
      )}

      {relatorio.data && relatorio.data.linhas.length === 0 && (
        <Vazio
          titulo="Nada neste mês"
          descricao={`Não há ${ROTULO_DA_DIRECAO[direcao].toLowerCase()} em ${formatarMes(mes)}.`}
        />
      )}

      {/* O atalho fica onde a pessoa vê o problema: a linha "Sem categoria" no relatório
          é o que dá vontade de classificar, e o botão precisa estar ao lado dela. */}
      {relatorio.data?.linhas.some((linha) => linha.categoriaId === null) && (
        <Link to="/app/classificar" className="w-fit">
          <Button variante="secundaria" tamanho="pequeno">
            <Stack size={16} aria-hidden />
            Classificar em lote
          </Button>
        </Link>
      )}

      {relatorio.data && relatorio.data.linhas.length > 0 && (
        <Cartao className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-borda pb-3">
            <span className="text-sm font-medium text-texto">
              Total de {ROTULO_DA_DIRECAO[direcao].toLowerCase()}
            </span>
            <Valor valor={relatorio.data.total} />
          </div>

          <ul className="flex flex-col gap-4">
            {relatorio.data.linhas.map((linha) => (
              <li key={linha.categoriaId ?? 'sem'} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: linha.cor ?? 'var(--cor-texto-suave)' }}
                    />
                    <span className="truncate text-sm text-texto">{linha.nome}</span>
                  </span>

                  <Valor valor={linha.previsto} />
                </div>

                {linha.limite && linha.consumo !== null && (
                  <Barra consumo={linha.consumo} limite={linha.limite} />
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-texto">Suas categorias</h2>

        {categorias.data?.length === 0 && (
          <Vazio
            titulo="Nenhuma categoria"
            descricao="Sem categorias, o sistema responde quanto você deve, mas não em quê você gasta."
            acao={<Button onClick={() => setEmEdicao('nova')}>Criar a primeira</Button>}
          />
        )}

        <ul className="flex flex-col gap-2">
          {categorias.data?.map((categoria) => (
            <li key={categoria.id}>
              <Cartao className="flex min-h-14 items-center gap-2 p-3">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: categoria.cor ?? 'var(--cor-texto-suave)' }}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-texto">{categoria.nome}</span>
                  <span className="text-xs text-texto-suave">
                    {categoria.direcao ? ROTULO_DA_DIRECAO[categoria.direcao] : 'Entrada e saída'}
                    {categoria.limite && ` · limite de ${formatarValor(categoria.limite)}`}
                  </span>
                </div>

                <Button
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Editar ${categoria.nome}`}
                  onClick={() => {
                    setErro(null);
                    setEmEdicao(categoria);
                  }}
                >
                  <PencilSimple size={18} aria-hidden />
                </Button>

                <Button
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Arquivar ${categoria.nome}`}
                  onClick={() => arquivar.mutate(categoria.id)}
                >
                  <Archive size={18} aria-hidden />
                </Button>
              </Cartao>
            </li>
          ))}
        </ul>
      </section>

      <SecaoDeArquivadas
        aberta={vendoArquivadas}
        aoAlternar={() => setVendoArquivadas((atual) => !atual)}
        categorias={arquivadas.data?.filter((categoria) => categoria.arquivada) ?? []}
        aoDesarquivar={(id) => desarquivar.mutate(id)}
      />

      <Painel
        aberto={emEdicao !== null}
        aoFechar={() => setEmEdicao(null)}
        titulo={editando ? 'Editar categoria' : 'Nova categoria'}
        descricao="Arquivar tira a categoria das listas sem mexer no histórico. Não há exclusão."
      >
        <form key={editando?.id ?? 'nova'} onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(id) => (
              <Input
                id={id}
                name="nome"
                placeholder="Mercado"
                defaultValue={editando?.nome}
                required
                autoFocus
              />
            )}
          </Campo>

          <Campo rotulo="Cor">
            {(id) => (
              <div id={id} className="flex flex-wrap gap-2">
                {CORES.map((cor, indice) => (
                  <label
                    key={cor}
                    className="flex size-11 cursor-pointer items-center justify-center rounded-padrao transition-transform hover:scale-110"
                  >
                    <input
                      type="radio"
                      name="cor"
                      value={cor}
                      defaultChecked={editando ? editando.cor === cor : indice === 0 && !editando}
                      className="sr-only peer"
                    />
                    <span
                      aria-label={`Cor ${indice + 1}`}
                      className="size-7 rounded-full ring-offset-2 ring-offset-superficie peer-checked:ring-2 peer-checked:ring-texto"
                      style={{ backgroundColor: cor }}
                    />
                  </label>
                ))}
              </div>
            )}
          </Campo>

          <Campo
            rotulo="Serve para"
            auxilio="Deixe em ambos quando a categoria vale dos dois lados."
          >
            {(id) => (
              <Select id={id} name="direcao" defaultValue={editando?.direcao ?? ''}>
                <option value="">Entrada e saída</option>
                {direcaoSchema.options.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {ROTULO_DA_DIRECAO[opcao]}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo
            rotulo="Limite mensal (opcional)"
            auxilio="Vale para todo mês. Passando dele, um aviso aparece na tela inicial."
          >
            {(id) => (
              <Input
                id={id}
                name="limite"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={editando?.limite ?? ''}
              />
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Painel>
    </div>
  );
}

/**
 * A barra de consumo do limite.
 *
 * A barra para em 100% da largura, mas o **texto** diz a porcentagem real. Uma barra que
 * cresce além do próprio contêiner quebra o layout; um número cortado em 100% esconderia
 * o tamanho do estouro, que é justamente o que faz alguém mudar de comportamento.
 */
function Barra({ consumo, limite }: { consumo: number; limite: string }) {
  const estourou = consumo > 1;
  const porcentagem = Math.round(consumo * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-2">
        <div
          className={`h-full rounded-full transition-[width] ${estourou ? 'bg-negativo' : 'bg-destaque'}`}
          style={{ width: `${Math.min(porcentagem, 100)}%` }}
        />
      </div>

      <span className={`text-xs ${estourou ? 'text-negativo' : 'text-texto-suave'}`}>
        {porcentagem}% do limite de {formatarValor(limite)}
        {estourou && ' · estourou'}
      </span>
    </div>
  );
}

/**
 * As categorias arquivadas, e o caminho de volta.
 *
 * Fica recolhida porque arquivar é justamente tirar da frente: uma lista sempre aberta com
 * o que a pessoa aposentou concorreria com o que ela usa. Mas precisa existir — sem ela, a
 * única forma de desarquivar era criar outra categoria com o mesmo nome, e ninguém adivinha
 * que essa é a porta.
 */
function SecaoDeArquivadas({
  aberta,
  aoAlternar,
  categorias,
  aoDesarquivar,
}: {
  aberta: boolean;
  aoAlternar: () => void;
  categorias: Categoria[];
  aoDesarquivar: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={aoAlternar}
        aria-expanded={aberta}
        className="flex min-h-11 items-center gap-2 rounded-padrao text-left text-sm text-texto-suave transition-colors hover:text-texto"
      >
        <CaretRight
          size={16}
          aria-hidden
          className={`shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`}
        />
        Categorias arquivadas
      </button>

      {aberta &&
        (categorias.length === 0 ? (
          <p className="pl-6 text-xs text-texto-suave">Nenhuma categoria arquivada.</p>
        ) : (
          <ul className="flex flex-col gap-2 pl-6">
            {categorias.map((categoria) => (
              <li key={categoria.id}>
                <Cartao className="flex min-h-14 items-center gap-2 p-3 opacity-70">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: categoria.cor ?? 'var(--cor-texto-suave)' }}
                  />

                  <span className="min-w-0 flex-1 truncate text-sm text-texto">
                    {categoria.nome}
                  </span>

                  <Button
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Desarquivar ${categoria.nome}`}
                    onClick={() => aoDesarquivar(categoria.id)}
                  >
                    <ArrowCounterClockwise size={18} aria-hidden />
                  </Button>
                </Cartao>
              </li>
            ))}
          </ul>
        ))}

      <p className="pl-6 text-xs text-texto-suave">
        Desarquivar devolve a categoria às listas de escolha. Os lançamentos antigos nunca deixaram
        de estar classificados nela.
      </p>
    </section>
  );
}
