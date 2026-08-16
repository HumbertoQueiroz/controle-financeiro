import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { formatarMes } from '@/lib/utils';
import { Cartao } from '@/components/ui/cartao';

/**
 * Navegação entre meses.
 *
 * Setas em vez de campo de data: o uso real é "ver o mês passado" e "ver o próximo", e
 * dois toques resolvem — abrir um seletor de calendário para isso é atrito.
 */
export function SeletorDeMes({
  mes,
  aoVoltar,
  aoAvancar,
}: {
  mes: string;
  aoVoltar: () => void;
  aoAvancar: () => void;
}) {
  return (
    <Cartao className="flex items-center justify-between gap-2 p-2">
      <button
        type="button"
        onClick={aoVoltar}
        aria-label="Mês anterior"
        className="flex h-11 w-11 items-center justify-center rounded-padrao text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <CaretLeft size={20} aria-hidden />
      </button>

      <p className="text-sm font-medium capitalize text-texto">{formatarMes(mes)}</p>

      <button
        type="button"
        onClick={aoAvancar}
        aria-label="Próximo mês"
        className="flex h-11 w-11 items-center justify-center rounded-padrao text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <CaretRight size={20} aria-hidden />
      </button>
    </Cartao>
  );
}
