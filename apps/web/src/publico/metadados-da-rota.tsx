import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadadosDaRota } from './metadados';

function definirMeta(seletor: string, atributo: string, valor: string, conteudo: string) {
  let elemento = document.head.querySelector<HTMLMetaElement>(seletor);

  if (!elemento) {
    elemento = document.createElement('meta');
    elemento.setAttribute(atributo, valor);
    document.head.appendChild(elemento);
  }

  elemento.setAttribute('content', conteudo);
}

/**
 * Mantém título e `robots` coerentes ao navegar dentro do app.
 *
 * O HTML pré-renderizado já traz os metadados certos no primeiro carregamento; isto cobre
 * a navegação por rota, que não recarrega a página. Sem ele, entrar no app a partir da
 * landing deixaria o `index, follow` dela valendo para uma tela de dados pessoais.
 */
export function MetadadosDaRota() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadados = metadadosDaRota(pathname);

    document.title = metadados.titulo;
    definirMeta('meta[name="description"]', 'name', 'description', metadados.descricao);
    definirMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      metadados.indexavel ? 'index, follow' : 'noindex, nofollow',
    );
  }, [pathname]);

  return null;
}
