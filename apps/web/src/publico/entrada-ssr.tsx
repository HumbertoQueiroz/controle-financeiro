import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Landing } from './landing';
import { DocumentoLegal } from './documento-legal';

export { metadadosDaRota, ROTAS_PUBLICAS } from './metadados';

/**
 * Ponto de entrada do build SSR.
 *
 * Precisa passar pelo Vite, e não pelo Node direto, porque as páginas legais importam o
 * markdown de `Docs/legal` com `?raw` — recurso do Vite que o Node não conhece. Compilar
 * este arquivo para um bundle resolve os imports e deixa o script de pré-renderização ser
 * um Node comum.
 */
export function renderizar(caminho: string): string {
  switch (caminho) {
    case '/':
      return renderToStaticMarkup(createElement(Landing));
    case '/termos':
      return renderToStaticMarkup(createElement(DocumentoLegal, { documento: 'termos' }));
    case '/privacidade':
      return renderToStaticMarkup(createElement(DocumentoLegal, { documento: 'privacidade' }));
    default:
      throw new Error(`Rota sem conteúdo pré-renderizável: ${caminho}`);
  }
}

/** As rotas que ganham HTML estático. As demais continuam SPA. */
export const ROTAS_PRE_RENDERIZADAS = ['/', '/termos', '/privacidade'];
