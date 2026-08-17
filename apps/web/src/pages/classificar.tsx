import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Sparkle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Categoria, GrupoParaClassificar, ParaClassificar } from '@controle/shared';
import { ROTULO_DA_DIRECAO } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Valor } from '@/components/ui/valor';

/**
 * Classificação em lote.
 *
 * Os lançamentos sem categoria vêm agrupados pela descrição, porque classificar um a um é
 * o que faz ninguém classificar: doze corridas de Uber são doze decisões idênticas. Pela
 * descrição, viram uma escolha só.
 *
 * A escolha de cada grupo fica no estado local até a pessoa aplicar. Gravar a cada seleção
 * faria a lista se reordenar debaixo do dedo — o grupo classificado sai dela — e a próxima
 * escolha cairia no grupo errado.
 */
export function Classificar() {
  const clienteDeQuery = useQueryClient();
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aplicados, setAplicados] = useState(0);

  const paraClassificar = useQuery({
    queryKey: ['classificar'],
    queryFn: () => api.get<ParaClassificar>('/classificar'),
  });

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get<Categoria[]>('/categorias'),
  });

  const grupos = paraClassificar.data?.grupos ?? [];

  // A escolha efetiva de cada grupo: o que a pessoa marcou, ou a sugestão vinda do que ela
  // já classificou antes. A sugestão aparece marcada, e não como dica a ser aceita — quem
  // não concordar troca, o que é menos trabalho que confirmar uma a uma.
  const escolhaDe = (grupo: GrupoParaClassificar) =>
    escolhas[grupo.chave] ?? grupo.sugestaoCategoriaId ?? '';

  // Sem `useMemo`: o teto é de 50 grupos, e memorizar um filtro desse tamanho custa mais
  // em complexidade de dependências do que economiza em processamento.
  const selecionados = grupos.filter((grupo) => escolhaDe(grupo) !== '');

  const totalDeLancamentos = selecionados.reduce((soma, grupo) => soma + grupo.quantidade, 0);

  const aplicar = useMutation({
    mutationFn: async () => {
      // Uma chamada por categoria, e não por grupo: dois grupos que vão para "Mercado"
      // viram uma requisição só, e o servidor faz um `updateMany` por lote.
      const porCategoria = new Map<string, string[]>();

      for (const grupo of selecionados) {
        const categoriaId = escolhaDe(grupo);
        porCategoria.set(categoriaId, [
          ...(porCategoria.get(categoriaId) ?? []),
          ...grupo.lancamentosIds,
        ]);
      }

      let total = 0;

      for (const [categoriaId, lancamentosIds] of porCategoria) {
        const resposta = await api.post<{ classificados: number }>('/classificar', {
          categoriaId,
          lancamentosIds,
        });

        total += resposta.classificados;
      }

      return total;
    },
    onSuccess: async (total) => {
      setErro(null);
      setEscolhas({});
      setAplicados(total);
      await Promise.all([
        clienteDeQuery.invalidateQueries({ queryKey: ['classificar'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['relatorio-categorias'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
        clienteDeQuery.invalidateQueries({ queryKey: ['avisos'] }),
      ]);
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const semCategorias = categorias.data?.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/app/categorias"
        className="flex min-h-11 w-fit items-center gap-1 text-sm text-texto-suave transition-colors hover:text-texto"
      >
        <ArrowLeft size={16} aria-hidden />
        Categorias
      </Link>

      <TituloDaSecao
        titulo="Classificar em lote"
        descricao="Lançamentos iguais vêm agrupados. Uma escolha classifica todos de uma vez."
      />

      {aplicados > 0 && (
        <p className="flex items-center gap-2 rounded-padrao border border-borda p-3 text-sm text-positivo">
          <Check size={18} aria-hidden />
          {aplicados} lançamento{aplicados === 1 ? '' : 's'} classificado
          {aplicados === 1 ? '' : 's'}.
        </p>
      )}

      {semCategorias && (
        <Vazio
          titulo="Nenhuma categoria ainda"
          descricao="Crie ao menos uma categoria antes de classificar."
          acao={
            <Link to="/app/categorias">
              <Button>Criar categoria</Button>
            </Link>
          }
        />
      )}

      {paraClassificar.isLoading && <Carregando />}
      {paraClassificar.isError && (
        <Erro
          mensagem="Não foi possível carregar"
          aoTentarDeNovo={() => paraClassificar.refetch()}
        />
      )}

      {!semCategorias && grupos.length === 0 && paraClassificar.isSuccess && (
        <Vazio
          titulo="Tudo classificado"
          descricao="Não há lançamento sem categoria. O relatório por categoria cobre o mês inteiro."
        />
      )}

      {grupos.length > 0 && !semCategorias && (
        <>
          <p className="text-sm text-texto-suave">
            {paraClassificar.data?.totalDeLancamentos} lançamento
            {paraClassificar.data?.totalDeLancamentos === 1 ? '' : 's'} sem categoria, em{' '}
            {grupos.length} grupo{grupos.length === 1 ? '' : 's'}.
          </p>

          <ul className="flex flex-col gap-2">
            {grupos.map((grupo) => {
              const escolha = escolhaDe(grupo);
              const veioDaSugestao =
                escolhas[grupo.chave] === undefined && grupo.sugestaoCategoriaId !== null;

              return (
                <li key={grupo.chave}>
                  <Cartao className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="truncate font-medium text-texto">{grupo.descricao}</p>
                        <p className="text-xs text-texto-suave">
                          {ROTULO_DA_DIRECAO[grupo.direcao]} · {grupo.quantidade} lançamento
                          {grupo.quantidade === 1 ? '' : 's'}
                        </p>
                        <p className="text-xs text-texto-suave">
                          {grupo.quantidade === 1
                            ? formatarData(grupo.primeiroVencimento)
                            : `de ${formatarData(grupo.primeiroVencimento)} a ${formatarData(grupo.ultimoVencimento)}`}
                        </p>
                      </div>

                      <Valor valor={grupo.total} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Select
                        aria-label={`Categoria de ${grupo.descricao}`}
                        value={escolha}
                        onChange={(evento) =>
                          setEscolhas((atual) => ({
                            ...atual,
                            [grupo.chave]: evento.target.value,
                          }))
                        }
                      >
                        <option value="">Deixar sem categoria</option>
                        {categorias.data
                          ?.filter(
                            (categoria) =>
                              !categoria.direcao || categoria.direcao === grupo.direcao,
                          )
                          .map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                              {categoria.nome}
                            </option>
                          ))}
                      </Select>

                      {veioDaSugestao && (
                        <p className="flex items-center gap-1 text-xs text-texto-suave">
                          <Sparkle size={14} aria-hidden />
                          Sugerido porque você já classificou um lançamento igual assim.
                        </p>
                      )}
                    </div>
                  </Cartao>
                </li>
              );
            })}
          </ul>

          {paraClassificar.data?.truncado && (
            // Dizer que a lista foi cortada é obrigatório: sem isso, aplicar e ver a tela
            // ainda cheia pareceria que nada aconteceu.
            <p className="text-xs text-texto-suave">
              Há mais grupos do que cabe numa tela. Ao aplicar estes, os próximos aparecem.
            </p>
          )}

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          {/*
           * A barra de ação acompanha a rolagem: com trinta grupos, um botão no fim da
           * página exigiria rolar tudo de volta para aplicar o que já foi decidido no
           * começo.
           *
           * Ela flutua **sobre** a lista, então precisa se ler como barra e não como mais
           * um cartão: sombra, `z-10` e sangria até as bordas. O `pb-28` no fim garante que
           * o último grupo consiga rolar para fora de baixo dela.
           */}
          <div className="pb-28" aria-hidden />

          <div className="sticky bottom-20 z-10 -mx-4 flex flex-col gap-2 border-t border-borda bg-superficie p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] lg:bottom-4 lg:-mx-2 lg:rounded-padrao lg:border">
            <Button
              largura="cheia"
              onClick={() => aplicar.mutate()}
              disabled={totalDeLancamentos === 0 || aplicar.isPending}
            >
              {aplicar.isPending
                ? 'Classificando…'
                : `Classificar ${totalDeLancamentos} lançamento${totalDeLancamentos === 1 ? '' : 's'}`}
            </Button>

            {totalDeLancamentos === 0 && (
              <p className="text-center text-xs text-texto-suave">
                Escolha a categoria de ao menos um grupo.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
