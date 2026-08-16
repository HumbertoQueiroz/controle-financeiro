import { X } from '@phosphor-icons/react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
}

/**
 * Painel de formulário e confirmação.
 *
 * Sobe de baixo no celular e vira diálogo centrado a partir de `sm:`. Formulário longo
 * dentro de um diálogo centralizado no celular fica com o topo fora da tela quando o
 * teclado abre; subindo de baixo, o primeiro campo continua visível.
 */
export function Painel({ aberto, aoFechar, titulo, descricao, children, rodape }: Props) {
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
          'sm:max-w-lg sm:rounded-2xl sm:pb-5',
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

        <div className="flex-1 overflow-y-auto">{children}</div>

        {rodape && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{rodape}</div>
        )}
      </div>
    </div>
  );
}
