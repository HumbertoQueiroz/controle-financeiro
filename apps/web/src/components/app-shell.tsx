import {
  ArrowDown,
  ArrowUp,
  ChartPieSlice,
  CreditCard,
  DotsThree,
  House,
  Moon,
  ShareNetwork,
  SignOut,
  Sun,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAutenticacao } from '@/auth/auth-context';
import { useTema } from '@/lib/tema';
import { cn } from '@/lib/utils';

interface ItemDeNavegacao {
  para: string;
  rotulo: string;
  Icone: Icon;
  fim?: boolean;
}

/**
 * Cinco itens é o teto do que cabe numa barra inferior sem apertar o alvo de toque.
 *
 * A receber e a pagar ficam aqui porque são o uso diário; cartões, grupos e o resto vivem
 * no menu, que só aparece no celular quando alguém procura.
 */
const ITENS: ItemDeNavegacao[] = [
  { para: '/app', rotulo: 'Orçamento', Icone: House, fim: true },
  { para: '/app/a-receber', rotulo: 'A receber', Icone: ArrowUp },
  { para: '/app/a-pagar', rotulo: 'A pagar', Icone: ArrowDown },
  { para: '/app/cartoes', rotulo: 'Cartões', Icone: CreditCard },
  { para: '/app/mais', rotulo: 'Mais', Icone: DotsThree },
];

/** O que não coube na barra inferior, e a barra lateral mostra por inteiro. */
const ITENS_SECUNDARIOS: ItemDeNavegacao[] = [
  { para: '/app/parcelamentos', rotulo: 'Parcelamentos', Icone: CreditCard },
  { para: '/app/grupos', rotulo: 'Grupos', Icone: UsersThree },
  { para: '/app/relatorios', rotulo: 'Relatórios', Icone: ChartPieSlice },
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

  const aoSair = async () => {
    await sair();
    navegar('/entrar', { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-fundo lg:flex-row">
      {/* Barra lateral: só a partir de lg, onde há largura sobrando */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-borda bg-superficie p-4 lg:flex">
        <p className="px-3 pb-4 text-sm font-semibold text-texto">Controle Financeiro</p>

        {ITENS.filter((item) => item.para !== '/app/mais').map((item) => (
          <ItemLateral key={item.para} item={item} />
        ))}

        {ITENS_SECUNDARIOS.map((item) => (
          <ItemLateral key={item.para} item={item} />
        ))}

        <div className="mt-auto flex flex-col gap-1">
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
        <header className="flex items-center justify-between gap-3 border-b border-borda bg-superficie px-4 py-3 lg:hidden">
          <p className="text-sm font-semibold text-texto">Controle Financeiro</p>

          <div className="flex items-center gap-1">
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
        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:pb-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-borda bg-superficie pb-seguro lg:hidden"
      >
        {ITENS.map(({ para, rotulo, Icone, fim }) => (
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
                  ? 'text-destaque hover:bg-destaque-suave'
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
            ? 'bg-destaque-suave font-medium text-destaque hover:opacity-90'
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
