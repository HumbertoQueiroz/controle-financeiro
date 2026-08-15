import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Cartao({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Hierarquia por espaçamento e borda, não por sombra: sombra pesada em lista
        // longa vira ruído e atrapalha a leitura de números.
        'rounded-[--radius-padrao] border border-borda bg-superficie',
        className,
      )}
      {...props}
    />
  );
}

export function TituloDaSecao({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        {descricao && <p className="text-sm text-texto-suave">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}
