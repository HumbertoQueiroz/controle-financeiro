import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

const baseDoControle =
  'min-h-11 w-full rounded-[--radius-padrao] border border-borda bg-superficie px-3 text-sm text-texto placeholder:text-texto-suave disabled:opacity-60';

interface CampoProps {
  rotulo: string;
  erro?: string;
  auxilio?: string;
  children: (id: string) => ReactNode;
}

/**
 * Rótulo, controle, ajuda e erro numa coluna.
 *
 * O erro é anunciado por `role="alert"` e ligado ao controle por `aria-describedby`: quem
 * usa leitor de tela precisa ouvir o motivo da recusa, não só descobrir que o formulário
 * não enviou.
 */
export function Campo({ rotulo, erro, auxilio, children }: CampoProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
      </label>

      {children(id)}

      {auxilio && !erro && <p className="text-xs text-texto-suave">{auxilio}</p>}
      {erro && (
        <p role="alert" className="text-xs text-negativo">
          {erro}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseDoControle, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(baseDoControle, 'pr-8', className)} {...props} />;
}
