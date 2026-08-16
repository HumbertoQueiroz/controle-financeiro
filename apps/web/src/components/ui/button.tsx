import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Uma ação primária por tela; o resto é secundário ou fantasma.
 *
 * A altura mínima é 44px em todas as variantes: é o alvo de toque confortável, e o app é
 * usado no celular na maior parte do tempo.
 */
const estilos = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-padrao px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // Toda variante tem hover: um controle que não reage ao ponteiro parece desligado,
      // e no desktop é o hover que confirma "isto é clicável" antes do clique.
      variante: {
        primaria: 'bg-destaque text-destaque-texto hover:opacity-90 active:opacity-80',
        secundaria:
          'border border-borda bg-superficie text-texto hover:border-texto-suave hover:bg-superficie-2',
        fantasma: 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
        destrutiva: 'bg-negativo text-white hover:opacity-90 active:opacity-80',
      },
      tamanho: {
        padrao: '',
        // "Pequeno" é compacto na aparência, não no alvo de toque: texto e padding
        // menores, altura preservada. Encolher a altura pouparia alguns pixels e custaria
        // toques errados em quem tem dedo grande ou está andando.
        pequeno: 'min-h-11 px-3 text-xs',
        icone: 'min-h-11 w-11 px-0',
      },
      largura: {
        auto: '',
        cheia: 'w-full',
      },
    },
    defaultVariants: { variante: 'primaria', tamanho: 'padrao', largura: 'auto' },
  },
);

interface Props extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estilos> {
  children?: ReactNode;
}

export function Button({ className, variante, tamanho, largura, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(estilos({ variante, tamanho, largura }), className)}
      {...props}
    />
  );
}
