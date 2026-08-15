# SEO e superfície pública

Quase todo o produto fica atrás de login e **não deve ser indexado**. SEO aqui é duas
coisas ao mesmo tempo: uma superfície de apresentação realmente rápida e indexável, e um
bloqueio rigoroso do resto.

| Superfície | Rotas                                                  | Indexável                |
| ---------- | ------------------------------------------------------ | ------------------------ |
| Pública    | `/`, `/termos`, `/privacidade`, `/entrar`, `/cadastro` | Sim                      |
| Privada    | `/app/*`                                               | Não                      |
| Convite    | `/convite/:token`                                      | Não, e com `no-referrer` |

## Pré-renderização

SPA em Vite entrega `<div id="root"></div>` vazio e preenche por JavaScript. A landing
levaria o LCP para depois do download do bundle, e o conteúdo só existiria para quem
executa JS.

O build gera HTML estático para `/`, `/termos` e `/privacidade`:

```
vite build                                    # SPA
vite build --ssr src/publico/entrada-ssr.tsx  # bundle usado pela pré-renderização
tsx prerender.mts                             # escreve o HTML e o sitemap
```

O passo SSR existe porque as páginas legais importam o markdown de `Docs/legal` com
`?raw` — recurso do Vite que o Node não conhece. Compilar aquele ponto de entrada resolve
os imports e deixa `prerender.mts` ser um Node comum.

O cliente monta com **`createRoot`, não `hydrateRoot`**: o markup pré-renderizado serve à
primeira pintura e o React remonta por cima de conteúdo idêntico. Evita a classe inteira de
bugs de divergência de hidratação, ao custo de uma remontagem que não é perceptível.

### Os documentos legais têm uma fonte só

`Docs/legal/termos-v1.md` e `privacidade-v1.md` são lidos direto pelas páginas. Manter uma
cópia do texto no componente garantiria que um dia a versão exibida divergisse da versão
que o usuário aceitou — e é o texto aceito que precisa ser demonstrável.

## Requisito de publicação: ordem do fallback

**O host precisa tentar `<caminho>/index.html` antes do fallback da SPA.** Sem isso,
`/termos` recebe o `index.html` da landing, e a pré-renderização daquelas páginas é
silenciosamente desperdiçada — a página ainda funciona, montada pelo cliente, mas perde
o conteúdo no HTML, que era o ponto.

Foi exatamente o que aconteceu no `vite preview`, que aplica o fallback antes de procurar o
arquivo. Vale conferir isso em produção olhando o HTML servido, não a tela.

**nginx**

```nginx
location / {
  try_files $uri $uri/index.html /index.html;
}
```

**Netlify** (`_redirects`) — a ordem importa, o primeiro que casa vence:

```
/termos        /termos/index.html        200
/privacidade   /privacidade/index.html   200
/*             /index.html               200
```

**Vercel** (`vercel.json`): `cleanUrls: true` e um `rewrite` de `/(.*)` para `/index.html`
**depois** das rotas estáticas.

## Metadados

Por rota, em `src/publico/metadados.ts` — importado tanto pelo navegador quanto pelo script
de pré-renderização, o que exige que ele não dependa de React.

- `<title>` e `<meta description>` escritos para a busca real ("fatura de cartão", "dividir
  contas"), não para o nome do produto.
- `<link rel="canonical">` por página.
- **Open Graph e Twitter Card** com imagem própria. Pesa mais que o normal aqui: o link do
  produto circula no WhatsApp, e o preview é o primeiro contato de boa parte das pessoas.
- **JSON-LD `WebApplication`** só na home — repetir a declaração em cada página não
  acrescenta e confunde qual é a entidade principal.
- `MetadadosDaRota` atualiza título e `robots` na navegação interna, que não recarrega a
  página. Sem ele, entrar no app a partir da landing deixaria o `index, follow` dela valendo
  para uma tela de dados pessoais.

### A imagem de compartilhamento

`public/og-image.png`, 1200×630, gerada por `pnpm --filter @controle/web og:image`.

**PNG e não SVG**: WhatsApp, Facebook e Twitter não renderizam SVG em preview de link, e um
`og:image` em SVG aparece como preview quebrado — justamente no canal por onde os convites
circulam.

O PNG é montado à mão com o `zlib` do Node, sem biblioteca gráfica: o desenho é feito de
retângulos, e trazer `sharp` ou `canvas` custaria dezenas de megabytes de dependência
nativa para gerar uma imagem só.

A imagem atual traz apenas a marca. Uma versão com texto tende a converter melhor no
preview — se for feita por alguém de design, basta substituir o arquivo e o script deixa
de ser necessário.

## Proteção do convite

O token do convite viaja no caminho da URL. Três camadas:

1. `Disallow: /convite/` no `robots.txt`.
2. `noindex, nofollow` injetado pela própria página.
3. `Referrer-Policy: no-referrer` — no `<meta name="referrer">` do documento e no cabeçalho
   da resposta da API. Sem isso, o token iria no `Referer` de qualquer recurso externo que
   a página carregasse.

O token está no **caminho** e não em query string de propósito: query string é o que costuma
acabar em log de servidor e em analytics.

## Desempenho

- Rotas com carregamento sob demanda: a landing e o login não baixam o bundle do app
  autenticado.
- O tema é aplicado por um script inline antes da primeira pintura. Em React isso rodaria
  depois do bundle, e quem usa tema escuro veria um lampejo branco em toda visita.
- `width`/`height` explícitos em imagem e skeleton com a altura da linha real, para o
  layout não saltar quando o conteúdo chega — a maior causa de CLS neste app seria a lista
  mudando de altura.
- Sem sourcemap em produção: o mapa reconstrói o código original e não há motivo para
  publicá-lo junto de um app financeiro.

### Pendências antes de publicar

- [ ] Trocar `SITE_URL` (padrão `https://controle-financeiro.app`) pelo domínio real, no
      ambiente de build. Ele entra em canonical, Open Graph e sitemap.
- [ ] Conferir a ordem do fallback no host, como descrito acima.
- [ ] Rodar o Lighthouse em perfil móvel na landing e conferir as metas: LCP < 2,5 s,
      CLS < 0,1, INP < 200 ms.
- [ ] Colar a URL no WhatsApp e conferir o preview de verdade.
