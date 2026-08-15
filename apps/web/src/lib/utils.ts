import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes deixando a última vencer em caso de conflito.
 *
 * Sem o merge, `cn('p-2', 'p-4')` deixaria as duas no HTML e o resultado dependeria da
 * ordem em que o Tailwind gerou o CSS — que não é a ordem em que foram escritas.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

export function formatarData(data: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(data));
}

export function formatarMes(mes: string): string {
  const [ano, numero] = mes.split('-');
  const nomes = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];

  return `${nomes[Number(numero) - 1] ?? mes} de ${ano}`;
}

/** Mês corrente em AAAA-MM, o formato que a API usa. */
export function mesAtual(): string {
  const agora = new Date();

  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}
