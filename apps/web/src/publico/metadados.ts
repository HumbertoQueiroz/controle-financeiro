export interface Metadados {
  titulo: string;
  descricao: string;
  /** Rotas privadas não devem ser indexadas, e a meta tag é a garantia que o robots.txt só pede. */
  indexavel: boolean;
}

/**
 * Metadados por rota, sem depender de React.
 *
 * O arquivo é importado tanto pelo app no navegador quanto pelo script de
 * pré-renderização em Node — manter React fora daqui é o que permite isso.
 */
const PUBLICAS: Record<string, Metadados> = {
  '/': {
    titulo: 'Controle Financeiro — fatura de cartão e divisão de contas',
    descricao:
      'Importe a fatura do cartão de crédito, marque o que foi de outra pessoa e divida as contas do rolê. Contas a pagar e a receber com saldo final.',
    indexavel: true,
  },
  '/termos': {
    titulo: 'Termos de Uso — Controle Financeiro',
    descricao: 'Condições de uso do Controle Financeiro.',
    indexavel: true,
  },
  '/privacidade': {
    titulo: 'Política de Privacidade — Controle Financeiro',
    descricao:
      'Como o Controle Financeiro trata seus dados: o que é coletado, para quê, e como exercer seus direitos.',
    indexavel: true,
  },
  '/entrar': {
    titulo: 'Entrar — Controle Financeiro',
    descricao: 'Acesse sua conta do Controle Financeiro.',
    indexavel: true,
  },
  '/cadastro': {
    titulo: 'Criar conta — Controle Financeiro',
    descricao: 'Crie sua conta gratuita no Controle Financeiro.',
    indexavel: true,
  },
};

const PRIVADO: Metadados = {
  titulo: 'Controle Financeiro',
  descricao: 'Suas contas a pagar e a receber.',
  indexavel: false,
};

export function metadadosDaRota(caminho: string): Metadados {
  return PUBLICAS[caminho] ?? PRIVADO;
}

export const ROTAS_PUBLICAS = Object.keys(PUBLICAS);
