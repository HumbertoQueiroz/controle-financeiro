import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Um pedaço do estado da tela guardado na URL.
 *
 * Existe para o link poder apontar para **um recorte**, e não só para uma página: sem isso,
 * "ver todos" do dashboard levaria à tela certa mostrando outro mês e outro filtro, que é
 * pior que não ter link. De quebra, o botão voltar do navegador passa a funcionar e a tela
 * sobrevive a um recarregamento.
 *
 * O valor padrão some da URL. Uma URL que carrega o estado inicial inteiro é ilegível e
 * transforma qualquer link compartilhado numa parede de parâmetros.
 */
export function useParametroDaUrl(nome: string, padrao: string) {
  const [busca, setBusca] = useSearchParams();

  const definir = useCallback(
    (valor: string) => {
      setBusca(
        (atual) => {
          const parametros = new URLSearchParams(atual);

          if (valor === padrao) parametros.delete(nome);
          else parametros.set(nome, valor);

          return parametros;
        },
        // `replace` porque trocar de mês é ajuste da mesma tela, não navegação: sem isto,
        // voltar depois de olhar seis meses exigiria seis toques para sair da página.
        { replace: true },
      );
    },
    [nome, padrao, setBusca],
  );

  return [busca.get(nome) ?? padrao, definir] as const;
}
