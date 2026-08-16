/**
 * Página inicial pública.
 *
 * É pré-renderizada para HTML no build e não depende de JavaScript para existir: SPA em
 * Vite entrega `<div id="root"></div>` vazio, e uma landing que só aparece depois do
 * bundle tem LCP ruim e conteúdo que o buscador precisa executar JS para ver.
 *
 * Por isso ela também não usa hook nenhum — é markup puro, determinístico.
 */
export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <span className="text-sm font-semibold text-texto">Controle Financeiro</span>

        <a
          href="/entrar"
          className="inline-flex min-h-11 items-center rounded-padrao px-4 text-sm font-medium text-texto transition-colors hover:bg-superficie-2"
        >
          Entrar
        </a>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col gap-5 px-5 py-10 sm:py-16">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 text-center">
            <h1 className="text-3xl font-semibold leading-tight text-texto sm:text-4xl">
              Sua fatura de cartão e as contas do rolê, no mesmo lugar
            </h1>

            <p className="text-base text-texto-suave sm:text-lg">
              Importe a fatura do cartão, marque o que foi de outra pessoa e feche o mês sabendo
              exatamente quem paga quem.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a
                href="/cadastro"
                className="inline-flex min-h-12 items-center justify-center rounded-padrao bg-destaque px-6 text-sm font-medium text-destaque-texto transition-opacity hover:opacity-90 active:opacity-80"
              >
                Criar conta grátis
              </a>

              <a
                href="/entrar"
                className="inline-flex min-h-12 items-center justify-center rounded-padrao border border-borda px-6 text-sm font-medium text-texto transition-colors hover:border-texto-suave hover:bg-superficie-2"
              >
                Já tenho conta
              </a>
            </div>
          </div>
        </section>

        <section className="px-5 pb-12">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Recurso
              titulo="Importe a fatura quantas vezes quiser"
              texto="Importe o CSV do seu banco no meio do mês e de novo no fim. Nada é duplicado: o sistema reconhece o que já entrou e acrescenta só o que é novo."
            />
            <Recurso
              titulo="Gasto que não era seu vira conta a receber"
              texto="Marque o lançamento que você repassou para alguém. A dívida com o cartão continua sua, e o valor entra como a receber daquela pessoa."
            />
            <Recurso
              titulo="Divida a conta do rolê sem planilha"
              texto="Lance quem pagou o quê e o sistema divide, até nos centavos que não fecham. No fim do mês ele resolve quem paga quem, já compensado."
            />
            <Recurso
              titulo="Você decide quem vê seus números"
              texto="Compartilhe só as contas a pagar, só as a receber, ou tudo com o saldo. O acesso é seu para dar e para tirar, a qualquer momento."
            />
          </div>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-borda px-5 py-8 text-center">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <a
            href="/termos"
            className="min-h-11 py-2 text-sm text-texto-suave underline transition-colors hover:text-texto"
          >
            Termos de Uso
          </a>
          <a
            href="/privacidade"
            className="min-h-11 py-2 text-sm text-texto-suave underline transition-colors hover:text-texto"
          >
            Política de Privacidade
          </a>
        </nav>

        <p className="text-xs text-texto-suave">
          Não movimentamos dinheiro nem acessamos sua conta bancária. Este é um caderno de anotações
          financeiras.
        </p>
      </footer>
    </div>
  );
}

function Recurso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <article className="flex flex-col gap-1.5 rounded-padrao border border-borda bg-superficie p-5">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      <p className="text-sm text-texto-suave">{texto}</p>
    </article>
  );
}
