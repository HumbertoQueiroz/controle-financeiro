import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Pré-renderiza as rotas públicas para HTML estático, depois do `vite build`.
 *
 * O motivo é estrutural: uma SPA em Vite entrega `<div id="root"></div>` vazio e preenche
 * por JavaScript. A landing levaria o LCP para depois do download do bundle, e o conteúdo
 * só existiria para quem executa JS. Com o HTML pronto, a primeira pintura acontece antes
 * de qualquer script.
 *
 * O app autenticado continua SPA puro — lá isso não importa, porque nada dele deve ser
 * indexado de qualquer forma.
 *
 * O cliente monta com `createRoot` (e não `hydrateRoot`) de propósito: o markup
 * pré-renderizado serve à primeira pintura, e o React remonta por cima de conteúdo
 * idêntico. Evita a classe inteira de bugs de divergência de hidratação, ao custo de uma
 * remontagem que não é perceptível.
 */

const raiz = dirname(fileURLToPath(import.meta.url));
const dist = resolve(raiz, 'dist');

const URL_DO_SITE = (process.env.SITE_URL ?? 'https://controle-financeiro.app').replace(/\/$/, '');

const bundle = await import(pathToFileURL(join(raiz, 'dist-ssr/entrada-ssr.js')).href);
const { renderizar, metadadosDaRota, ROTAS_PUBLICAS, ROTAS_PRE_RENDERIZADAS } = bundle as {
  renderizar: (caminho: string) => string;
  metadadosDaRota: (caminho: string) => { titulo: string; descricao: string };
  ROTAS_PUBLICAS: string[];
  ROTAS_PRE_RENDERIZADAS: string[];
};

const modelo = readFileSync(join(dist, 'index.html'), 'utf8');

function montarCabecalho(caminho: string): string {
  const { titulo, descricao } = metadadosDaRota(caminho);
  const url = `${URL_DO_SITE}${caminho === '/' ? '/' : caminho}`;

  // JSON-LD só na home: repetir a declaração da aplicação em cada página não acrescenta
  // nada e confunde qual é a entidade principal.
  const jsonLd =
    caminho === '/'
      ? `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Controle Financeiro',
          description: descricao,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web',
          inLanguage: 'pt-BR',
          url: `${URL_DO_SITE}/`,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        })}</script>`
      : '';

  return [
    `<title>${titulo}</title>`,
    `<meta name="description" content="${descricao}" />`,
    '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${url}" />`,
    // Open Graph pesa mais que o normal aqui: o link do produto circula no WhatsApp, e o
    // preview é o primeiro contato de boa parte das pessoas com ele.
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Controle Financeiro" />',
    '<meta property="og:locale" content="pt_BR" />',
    `<meta property="og:title" content="${titulo}" />`,
    `<meta property="og:description" content="${descricao}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${URL_DO_SITE}/og-image.png" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    jsonLd,
  ]
    .filter(Boolean)
    .join('\n    ');
}

for (const caminho of ROTAS_PRE_RENDERIZADAS) {
  const html = modelo
    .replace('<!--seo-->', montarCabecalho(caminho))
    // As rotas públicas são indexáveis; o modelo traz noindex por ser o padrão do app.
    .replace('<meta name="robots" content="noindex, nofollow" />', '')
    .replace('<div id="root"></div>', `<div id="root">${renderizar(caminho)}</div>`);

  const destino = caminho === '/' ? join(dist, 'index.html') : join(dist, caminho, 'index.html');

  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html, 'utf8');

  console.warn(`pré-renderizado: ${caminho}`);
}

// O sitemap lista só o que deve ser indexado. /app e /convite ficam de fora por definição.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROTAS_PUBLICAS.map(
  (caminho) =>
    `  <url><loc>${URL_DO_SITE}${caminho === '/' ? '/' : caminho}</loc><changefreq>monthly</changefreq></url>`,
).join('\n')}
</urlset>
`;

writeFileSync(join(dist, 'sitemap.xml'), sitemap, 'utf8');
console.warn('sitemap.xml gerado');
