import { marked } from 'marked';
import termosMarkdown from '@legal/termos-v1.md?raw';
import privacidadeMarkdown from '@legal/privacidade-v1.md?raw';

/**
 * Termos e Política renderizados a partir dos arquivos em `Docs/legal/`.
 *
 * O markdown é a fonte única: manter uma cópia do texto aqui garantiria que um dia a
 * versão exibida ao usuário divergisse da versão que ele aceitou — e é o texto aceito que
 * precisa ser demonstrável.
 *
 * A conversão acontece no módulo, não em efeito: assim o resultado é determinístico e a
 * página pode ser pré-renderizada para HTML no build.
 */
marked.setOptions({ gfm: true, breaks: false });

const DOCUMENTOS = {
  termos: { titulo: 'Termos de Uso', html: marked.parse(termosMarkdown) as string },
  privacidade: {
    titulo: 'Política de Privacidade',
    html: marked.parse(privacidadeMarkdown) as string,
  },
} as const;

export function DocumentoLegal({ documento }: { documento: keyof typeof DOCUMENTOS }) {
  const { html } = DOCUMENTOS[documento];

  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="flex items-center gap-4 border-b border-borda px-5 py-4">
        <a
          href="/"
          className="min-h-11 py-2 text-sm font-semibold text-texto transition-colors hover:text-destaque"
        >
          Controle Financeiro
        </a>
      </header>

      <main className="flex-1 px-5 py-8">
        <article
          className="mx-auto flex w-full max-w-2xl flex-col text-texto [&_a]:text-destaque [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-atencao [&_blockquote]:pl-4 [&_blockquote]:text-texto-suave [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_p]:text-sm [&_p]:leading-relaxed [&_strong]:font-semibold [&_table]:mb-4 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-sm [&_td]:border [&_td]:border-borda [&_td]:p-2 [&_th]:border [&_th]:border-borda [&_th]:p-2 [&_th]:text-left [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5"
          // O conteúdo vem de arquivos do próprio repositório, versionados e revisados —
          // não de entrada de usuário. Não há caminho por onde um terceiro injete markup.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>

      <footer className="border-t border-borda px-5 py-6 text-center">
        <a
          href="/"
          className="inline-block min-h-11 py-2 text-sm text-texto-suave underline transition-colors hover:text-texto"
        >
          Voltar ao início
        </a>
      </footer>
    </div>
  );
}

export function tituloDoDocumento(documento: keyof typeof DOCUMENTOS): string {
  return DOCUMENTOS[documento].titulo;
}
