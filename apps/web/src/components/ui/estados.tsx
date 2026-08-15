import type { ReactNode } from 'react';
import { Warning } from '@phosphor-icons/react';
import { Button } from './button';
import { Cartao } from './cartao';

/**
 * Toda tela tem quatro estados, e cada um precisa existir de verdade. Uma lista que só
 * sabe mostrar dados deixa o usuário olhando para o nada quando não há nenhum.
 */

export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, indice) => (
        <div
          key={indice}
          // Skeleton com a altura da linha real, não spinner de página inteira: o layout
          // não salta quando o conteúdo chega, e é a maior causa de CLS neste app.
          className="h-16 animate-pulse rounded-[--radius-padrao] bg-superficie-2"
        />
      ))}
    </div>
  );
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <Cartao className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="font-medium text-texto">{titulo}</p>
      {descricao && <p className="max-w-sm text-sm text-texto-suave">{descricao}</p>}
      {/* O estado vazio traz a ação que o resolve — senão vira só um aviso. */}
      {acao}
    </Cartao>
  );
}

export function Erro({
  mensagem,
  aoTentarDeNovo,
}: {
  mensagem: string;
  aoTentarDeNovo?: () => void;
}) {
  return (
    <Cartao className="flex flex-col items-center gap-3 border-negativo/40 bg-negativo-suave p-6 text-center">
      <Warning size={24} className="text-negativo" aria-hidden />
      <p className="text-sm text-texto">{mensagem}</p>
      {aoTentarDeNovo && (
        <Button variante="secundaria" tamanho="pequeno" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Button>
      )}
    </Cartao>
  );
}
