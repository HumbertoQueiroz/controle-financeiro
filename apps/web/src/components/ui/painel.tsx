import { CaretDown, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  /**
   * Largura no desktop. `estreito` é o padrão e serve a formulário de uma coluna; `largo`
   * é para conteúdo que tem colunas próprias, como a classificação da importação, onde
   * cada linha traz descrição, valor e dois seletores lado a lado.
   *
   * No celular os dois ocupam a largura toda — não há o que escolher em 375px.
   */
  largura?: 'estreito' | 'largo';
}

const LARGURA = {
  estreito: 'sm:max-w-lg',
  largo: 'sm:max-w-3xl',
} as const;

/**
 * Painel de formulário e confirmação.
 *
 * Sobe de baixo no celular e vira diálogo centrado a partir de `sm:`. Formulário longo
 * dentro de um diálogo centralizado no celular fica com o topo fora da tela quando o
 * teclado abre; subindo de baixo, o primeiro campo continua visível.
 */
export function Painel({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'estreito',
}: Props) {
  const areaDeRolagem = useRef<HTMLDivElement>(null);
  const [temMais, setTemMais] = useState(false);

  /**
   * Se ainda há conteúdo abaixo do que se vê.
   *
   * A margem de 4px absorve o arredondamento de altura em telas com zoom ou densidade
   * fracionária: sem ela, a rolagem chega ao fim com uma sobra de meio pixel e a seta fica
   * piscando para sempre, apontando para um conteúdo que não existe.
   */
  const medir = useCallback(() => {
    const area = areaDeRolagem.current;

    if (!area) return;

    setTemMais(area.scrollHeight - area.scrollTop - area.clientHeight > 4);
  }, []);

  useEffect(() => {
    const area = areaDeRolagem.current;

    if (!aberto || !area) return;

    medir();

    // O conteúdo muda de altura sem ninguém rolar — uma seção que abre, uma lista que
    // carrega. Sem observar, a seta some ou aparece só no primeiro toque na rolagem.
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    for (const filho of Array.from(area.children)) observador.observe(filho);

    return () => observador.disconnect();
  }, [aberto, medir, children]);

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };

    document.addEventListener('keydown', aoTeclar);
    // Trava a rolagem de fundo: sem isso, rolar dentro do painel arrasta a página atrás.
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col gap-4 rounded-t-2xl border border-borda bg-superficie p-5 pb-seguro',
          'sm:rounded-2xl sm:pb-5',
          LARGURA[largura],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-texto">{titulo}</h2>
            {descricao && <p className="text-sm text-texto-suave">{descricao}</p>}
          </div>

          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-m-2 flex h-11 w-11 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* `relative` para a seta se posicionar sobre o fim da área, e não sobre o painel:
            com o rodapé presente, ancorar no painel colocaria a seta em cima dos botões. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/*
           * A altura vem de `flex-1` + `min-h-0`, e **nunca** de `h-full`.
           *
           * `h-full` é `height: 100%`, e o pai aqui tem altura `auto` resolvida pelo flex —
           * a porcentagem não resolve, o elemento cresce até o conteúdo e passa a ser maior
           * que o próprio pai. O sintoma é preciso e silencioso: `scrollHeight` fica igual a
           * `clientHeight`, então não há o que rolar, a rolagem simplesmente não funciona e
           * a seta de "tem mais abaixo" nunca aparece porque, para o navegador, não tem.
           */}
          {/*
           * `-mx-1 px-1` dá folga lateral para o contorno de foco.
           *
           * `overflow-y-auto` corta nos dois eixos, e o `:focus-visible` desenha 2px de
           * contorno com 2px de deslocamento **fora** da borda do campo — que, num campo de
           * largura cheia, cai exatamente na aresta do recorte. O sintoma é o contorno
           * aparecer em cima e embaixo e sumir dos lados.
           *
           * `pb-6` mantém o último controle longe da aresta inferior: colado nela, o botão
           * de salvar parece cortado e vira alvo de toque na borda da tela.
           */}
          <div
            ref={areaDeRolagem}
            onScroll={medir}
            className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-6 sem-barra-de-rolagem"
          >
            {children}
          </div>

          {/*
           * A dica de que há mais conteúdo, já que a barra de rolagem não está mais lá.
           *
           * `pointer-events-none` porque ela cobre o conteúdo: sem isso, a seta engoliria o
           * clique no último campo visível e a rolagem por arraste pararia embaixo dela.
           */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1 pt-8',
              'bg-gradient-to-t from-superficie to-transparent',
              'transition-opacity duration-200',
              temMais ? 'opacity-100' : 'opacity-0',
            )}
          >
            <CaretDown size={20} weight="bold" className="animate-descer text-texto-suave" />
          </div>
        </div>

        {rodape && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{rodape}</div>
        )}
      </div>
    </div>
  );
}
