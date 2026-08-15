import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ColunaDaLista<T> {
  chave: string;
  titulo: string;
  /** Conteúdo da célula na tabela e da linha no cartão. */
  render: (item: T) => ReactNode;
  /** Colunas alinhadas à direita são as de valor. */
  alinharADireita?: boolean;
  /** Some no cartão de celular: detalhe que não cabe e não é essencial. */
  ocultarNoCelular?: boolean;
  /** Vira o título do cartão no celular, em vez de virar uma linha rotulada. */
  principal?: boolean;
}

interface Props<T> {
  itens: T[];
  colunas: ColunaDaLista<T>[];
  chaveDoItem: (item: T) => string;
  aoClicarNoItem?: (item: T) => void;
  className?: string;
}

/**
 * Lista de dados responsiva.
 *
 * **Tabela não sobrevive a 375px.** No celular cada registro vira um cartão empilhado com
 * os rótulos ao lado dos valores; a partir de `md:` vira tabela de verdade. Resolver isso
 * uma vez aqui evita que cada tela reinvente — e evita a alternativa comum, que é deixar a
 * tabela rolar de lado e obrigar a pessoa a arrastar para ver quanto deve.
 */
export function ListaDeDados<T>({
  itens,
  colunas,
  chaveDoItem,
  aoClicarNoItem,
  className,
}: Props<T>) {
  const principal = colunas.find((coluna) => coluna.principal) ?? colunas[0];
  const secundarias = colunas.filter((coluna) => coluna !== principal);

  return (
    <div className={className}>
      {/* Celular: cartões empilhados */}
      <ul className="flex flex-col gap-2 md:hidden">
        {itens.map((item) => (
          <li key={chaveDoItem(item)}>
            <Envoltorio
              aoClicar={aoClicarNoItem ? () => aoClicarNoItem(item) : undefined}
              className="flex w-full flex-col gap-2 rounded-[--radius-padrao] border border-borda bg-superficie p-4 text-left"
            >
              <div className="font-medium text-texto">{principal?.render(item)}</div>

              <dl className="flex flex-col gap-1">
                {secundarias
                  .filter((coluna) => !coluna.ocultarNoCelular)
                  .map((coluna) => (
                    <div key={coluna.chave} className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-texto-suave">{coluna.titulo}</dt>
                      <dd className="text-sm text-texto">{coluna.render(item)}</dd>
                    </div>
                  ))}
              </dl>
            </Envoltorio>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela, onde linhas e colunas de fato se alinham */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda text-left">
              {colunas.map((coluna) => (
                <th
                  key={coluna.chave}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-xs font-medium text-texto-suave',
                    coluna.alinharADireita && 'text-right',
                  )}
                >
                  {coluna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={chaveDoItem(item)}
                onClick={aoClicarNoItem ? () => aoClicarNoItem(item) : undefined}
                className={cn(
                  'border-b border-borda last:border-0',
                  aoClicarNoItem && 'cursor-pointer hover:bg-superficie-2',
                )}
              >
                {colunas.map((coluna) => (
                  <td
                    key={coluna.chave}
                    className={cn('px-3 py-3 text-texto', coluna.alinharADireita && 'text-right')}
                  >
                    {coluna.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Envoltorio({
  aoClicar,
  className,
  children,
}: {
  aoClicar?: () => void;
  className: string;
  children: ReactNode;
}) {
  // Item clicável é `button`, não `div` com onClick: só assim recebe foco pelo teclado e é
  // anunciado como acionável pelo leitor de tela.
  if (aoClicar) {
    return (
      <button type="button" onClick={aoClicar} className={cn(className, 'hover:bg-superficie-2')}>
        {children}
      </button>
    );
  }

  return <div className={className}>{children}</div>;
}
