import {
  ArrowsClockwise,
  Bank,
  ChartPieSlice,
  CaretRight,
  CreditCard,
  Handshake,
  Receipt,
  ShareNetwork,
  SquaresFour,
  UserCircle,
  Users,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useAutenticacao } from '@/auth/auth-context';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';

/**
 * O que não cabe na barra inferior.
 *
 * Cinco itens é o teto de uma barra inferior sem apertar o alvo de toque, então o uso
 * diário fica lá e o resto vive aqui. No desktop nada disso é necessário: a barra lateral
 * mostra tudo de uma vez.
 */
const SECOES: { para: string; titulo: string; descricao: string; Icone: Icon }[] = [
  {
    para: '/app/contas',
    titulo: 'Contas',
    descricao: 'Onde o dinheiro fica, e quanto tem em cada uma',
    Icone: Bank,
  },
  {
    para: '/app/categorias',
    titulo: 'Categorias',
    descricao: 'Em que você gasta, com limite por mês',
    Icone: SquaresFour,
  },
  {
    para: '/app/recorrentes',
    titulo: 'Recorrentes',
    descricao: 'Salário, aluguel, internet — o que se repete',
    Icone: ArrowsClockwise,
  },
  {
    para: '/app/orcamento',
    titulo: 'Orçamento do mês',
    descricao: 'Tudo que vence no mês, item a item',
    Icone: ChartPieSlice,
  },
  {
    para: '/app/participantes',
    titulo: 'Participantes',
    descricao: 'Quanto cada pessoa deve a você, e você a ela',
    Icone: Handshake,
  },
  {
    para: '/app/fechamentos',
    titulo: 'Fechamentos',
    descricao: 'Os acertos de contas já feitos',
    Icone: Receipt,
  },
  {
    para: '/app/parcelamentos',
    titulo: 'Parcelamentos',
    descricao: 'Compras parceladas e o que ainda falta',
    Icone: CreditCard,
  },
  {
    para: '/app/grupos',
    titulo: 'Grupos',
    descricao: 'Rateio dos rolês e fechamento do mês',
    Icone: UsersThree,
  },
  {
    para: '/app/relatorios',
    titulo: 'Relatórios',
    descricao: 'A pagar, a receber e saldo final',
    Icone: ChartPieSlice,
  },
  {
    para: '/app/pessoas',
    titulo: 'Pessoas',
    descricao: 'Quem participa das suas contas',
    Icone: Users,
  },
  {
    para: '/app/compartilhar',
    titulo: 'Compartilhar',
    descricao: 'Quem pode ver seus relatórios',
    Icone: ShareNetwork,
  },
  {
    para: '/app/conta',
    titulo: 'Minha conta',
    descricao: 'Senha, meus dados e exclusão',
    Icone: UserCircle,
  },
];

export function Mais() {
  const { usuario } = useAutenticacao();

  const secoes =
    usuario?.papel === 'ADMIN'
      ? [
          ...SECOES,
          {
            para: '/app/admin/usuarios',
            titulo: 'Usuários',
            descricao: 'Administração de contas',
            Icone: UsersThree,
          },
        ]
      : SECOES;

  return (
    <>
      <TituloDaSecao titulo="Mais" />

      <ul className="flex flex-col gap-2">
        {secoes.map((secao) => (
          <li key={secao.para}>
            <Link to={secao.para} className="block">
              <Cartao className="flex min-h-14 items-center gap-3 p-4 transition-colors hover:bg-superficie-2">
                <secao.Icone size={22} className="shrink-0 text-texto-suave" aria-hidden />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="font-medium text-texto">{secao.titulo}</p>
                  <p className="truncate text-xs text-texto-suave">{secao.descricao}</p>
                </div>

                <CaretRight size={18} className="shrink-0 text-texto-suave" aria-hidden />
              </Cartao>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
