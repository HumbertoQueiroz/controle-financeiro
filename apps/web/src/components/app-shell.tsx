import {
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  Bank,
  ChartPieSlice,
  CreditCard,
  DotsThree,
  Handshake,
  House,
  MagnifyingGlass,
  Moon,
  Receipt,
  ShareNetwork,
  SignOut,
  SquaresFour,
  Sun,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAutenticacao } from '@/auth/auth-context';
import { useTema } from '@/lib/tema';
import { cn } from '@/lib/utils';
import { PainelDeAvisos, SinoDeAvisos } from '@/features/avisos/painel-de-avisos';
import { PainelDeBusca } from '@/features/busca/painel-de-busca';

interface ItemDeNavegacao {
  para: string;
  rotulo: string;
  Icone: Icon;
  fim?: boolean;
  /** De que lado do dinheiro o item está, para a tonalidade de fundo. */
  tom?: 'entrada' | 'saida';
}

/**
 * Cinco itens é o teto do que cabe numa barra inferior sem apertar o alvo de toque.
 *
 * A receber e a pagar ficam aqui porque são o uso diário; cartões, grupos e o resto vivem
 * no menu, que só aparece no celular quando alguém procura.
 */
const ITENS: ItemDeNavegacao[] = [
  { para: '/app', rotulo: 'Início', Icone: House, fim: true },
  // A seta aponta para o **movimento do dinheiro em relação a você**: entra, seta para
  // baixo; sai, seta para cima. É a convenção de extrato bancário, e era o contrário aqui.
  //
  // A cor é uma insinuação, não a informação: azul no que entra, laranja no que sai, e
  // sempre com o rótulo escrito ao lado. Quem não distingue as duas lê "A receber".
  { para: '/app/a-receber', rotulo: 'A receber', Icone: ArrowDown, tom: 'entrada' },
  { para: '/app/a-pagar', rotulo: 'A pagar', Icone: ArrowUp, tom: 'saida' },
  { para: '/app/cartoes', rotulo: 'Cartões', Icone: CreditCard },
  { para: '/app/mais', rotulo: 'Mais', Icone: DotsThree },
];

/** A tonalidade de fundo de cada lado do dinheiro, aplicada só quando o item está ativo. */
const TOM_ATIVO: Record<NonNullable<ItemDeNavegacao['tom']>, string> = {
  entrada: 'bg-entrada-suave text-entrada',
  saida: 'bg-saida-suave text-saida',
};

/** O que não coube na barra inferior, e a barra lateral mostra por inteiro. */
const ITENS_SECUNDARIOS: ItemDeNavegacao[] = [
  { para: '/app/orcamento', rotulo: 'Orçamento', Icone: ChartPieSlice },
  { para: '/app/contas', rotulo: 'Contas', Icone: Bank },
  { para: '/app/categorias', rotulo: 'Categorias', Icone: SquaresFour },
  { para: '/app/recorrentes', rotulo: 'Recorrentes', Icone: ArrowsClockwise },
  { para: '/app/parcelamentos', rotulo: 'Parcelamentos', Icone: CreditCard },
  { para: '/app/grupos', rotulo: 'Grupos', Icone: UsersThree },
  { para: '/app/relatorios', rotulo: 'Relatórios', Icone: ChartPieSlice },
  { para: '/app/participantes', rotulo: 'Participantes', Icone: Handshake },
  { para: '/app/fechamentos', rotulo: 'Fechamentos', Icone: Receipt },
  { para: '/app/pessoas', rotulo: 'Pessoas', Icone: UsersThree },
  { para: '/app/compartilhar', rotulo: 'Compartilhar', Icone: ShareNetwork },
];

/**
 * Casca do app.
 *
 * Barra inferior no celular e barra lateral a partir de `lg:` — o polegar alcança o rodapé
 * e não o topo, e é no celular que este app é usado para conferir fatura e dividir conta.
 * Todo o layout é flexbox: são pilhas e linhas, não grades bidimensionais.
 */
export function AppShell() {
  const { usuario, sair } = useAutenticacao();
  const { tema, alternar } = useTema();
  const navegar = useNavigate();
  const [buscando, setBuscando] = useState(false);
  const [vendoAvisos, setVendoAvisos] = useState(false);

  const aoSair = async () => {
    await sair();
    navegar('/entrar', { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-fundo lg:flex-row">
      {/* Barra lateral: só a partir de lg, onde há largura sobrando */}
      <aside className="sem-impressao hidden w-60 shrink-0 flex-col gap-1 border-r border-borda bg-superficie p-4 lg:flex">
        <div className="flex items-center justify-between gap-1 pb-2">
          <p className="px-3 text-sm font-semibold text-texto">Controle Financeiro</p>

          {/* O tema também no desktop: ele só existia no cabeçalho do celular, e quem usa
              no computador ficava sem caminho nenhum para trocar. */}
          <div className="flex items-center">
            <BotaoDeBusca aoAbrir={() => setBuscando(true)} />
            <SinoDeAvisos aoAbrir={() => setVendoAvisos(true)} />
            <BotaoDeTema tema={tema} alternar={alternar} />
          </div>
        </div>

        {ITENS.filter((item) => item.para !== '/app/mais').map((item) => (
          <ItemLateral key={item.para} item={item} />
        ))}

        {ITENS_SECUNDARIOS.map((item) => (
          <ItemLateral key={item.para} item={item} />
        ))}

        {/* Colado no grupo de cima, e não empurrado para o rodapé: "Compartilhar" e
            "Minha conta" são vizinhos na leitura, e um vão de meia tela entre eles fazia
            parecer que a lista tinha acabado. */}
        <div className="mt-2 flex flex-col gap-1 border-t border-borda pt-2">
          {usuario?.papel === 'ADMIN' && (
            <ItemLateral
              item={{ para: '/app/admin/usuarios', rotulo: 'Usuários', Icone: UsersThree }}
            />
          )}
          <ItemLateral item={{ para: '/app/conta', rotulo: 'Minha conta', Icone: UserCircle }} />

          <button
            type="button"
            onClick={aoSair}
            className="flex min-h-11 items-center gap-3 rounded-padrao px-3 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <SignOut size={20} aria-hidden />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sem-impressao flex items-center justify-between gap-3 border-b border-borda bg-superficie px-4 py-3 lg:hidden">
          <p className="text-sm font-semibold text-texto">Controle Financeiro</p>

          <div className="flex items-center gap-1">
            <BotaoDeBusca aoAbrir={() => setBuscando(true)} />
            <SinoDeAvisos aoAbrir={() => setVendoAvisos(true)} />
            <BotaoDeTema tema={tema} alternar={alternar} />
            <button
              type="button"
              onClick={aoSair}
              aria-label="Sair"
              className="flex h-11 w-11 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
            >
              <SignOut size={20} aria-hidden />
            </button>
          </div>
        </header>

        {/* pb-24 abre espaço para a barra inferior não cobrir o fim da lista */}
        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:pb-8 print:p-0">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>

      <PainelDeBusca aberto={buscando} aoFechar={() => setBuscando(false)} />
      <PainelDeAvisos aberto={vendoAvisos} aoFechar={() => setVendoAvisos(false)} />

      <nav
        aria-label="Navegação principal"
        className="sem-impressao fixed inset-x-0 bottom-0 z-40 flex border-t border-borda bg-superficie pb-seguro lg:hidden"
      >
        {ITENS.map(({ para, rotulo, Icone, fim, tom }) => (
          <NavLink
            key={para}
            to={para}
            end={fim}
            className={({ isActive }) =>
              cn(
                // min-h-14 mantém o alvo de toque acima de 44px com folga
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] transition-colors',
                // O item ativo também reage: sem isso ele é o único da barra que parece
                // desligado quando o ponteiro passa por cima.
                isActive
                  ? tom
                    ? TOM_ATIVO[tom]
                    : 'text-destaque hover:bg-destaque-suave'
                  : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icone size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                {rotulo}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function ItemLateral({ item }: { item: ItemDeNavegacao }) {
  return (
    <NavLink
      to={item.para}
      end={item.fim}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-padrao px-3 text-sm transition-colors',
          isActive
            ? cn(
                'font-medium hover:opacity-90',
                item.tom ? TOM_ATIVO[item.tom] : 'bg-destaque-suave text-destaque',
              )
            : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
        )
      }
    >
      <item.Icone size={20} aria-hidden />
      {item.rotulo}
    </NavLink>
  );
}

function BotaoDeTema({ tema, alternar }: { tema: string; alternar: () => void }) {
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
      className="flex h-11 w-11 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      {tema === 'escuro' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  );
}

function BotaoDeBusca({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label="Buscar"
      className="flex size-11 items-center justify-center rounded-padrao text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      <MagnifyingGlass size={20} aria-hidden />
    </button>
  );
}
