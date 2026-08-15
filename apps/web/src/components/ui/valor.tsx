import { formatarValor } from '@controle/shared';
import { cn } from '@/lib/utils';

interface Props {
  valor: string | number;
  /** `automatico` colore pelo sinal; os demais forçam o significado. */
  tom?: 'automatico' | 'neutro' | 'positivo' | 'negativo';
  tamanho?: 'padrao' | 'grande';
  className?: string;
}

/**
 * Valor monetário.
 *
 * A cor **nunca** vai sozinha: o sinal acompanha sempre. Quem não distingue verde de
 * vermelho — cerca de 8% dos homens — leria uma coluna inteira de números sem saber quais
 * são dívida, e num app de finanças isso não é detalhe estético.
 */
export function Valor({ valor, tom = 'neutro', tamanho = 'padrao', className }: Props) {
  const numero = typeof valor === 'string' ? Number(valor) : valor;

  const tomEfetivo =
    tom === 'automatico' ? (numero < 0 ? 'negativo' : numero > 0 ? 'positivo' : 'neutro') : tom;

  const sinal = tom === 'automatico' && numero > 0 ? '+' : '';

  return (
    <span
      className={cn(
        'dinheiro whitespace-nowrap font-medium',
        tamanho === 'grande' ? 'text-2xl font-semibold' : 'text-sm',
        tomEfetivo === 'positivo' && 'text-positivo',
        tomEfetivo === 'negativo' && 'text-negativo',
        tomEfetivo === 'neutro' && 'text-texto',
        className,
      )}
    >
      {sinal}
      {formatarValor(numero)}
    </span>
  );
}
