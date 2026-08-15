import { describe, expect, it } from 'vitest';
import { metadadosDaRota, ROTAS_PUBLICAS } from './metadados';

describe('metadados por rota', () => {
  it('marca as rotas de apresentação como indexáveis', () => {
    for (const rota of ['/', '/termos', '/privacidade', '/entrar', '/cadastro']) {
      expect(metadadosDaRota(rota).indexavel).toBe(true);
    }
  });

  it('marca como não indexável tudo que fica atrás de login', () => {
    // A meta tag é a garantia; o robots.txt só pede. Um buscador que ignore o robots
    // ainda respeita o noindex, e é aí que estão os dados de quem usa o sistema.
    for (const rota of ['/app', '/app/relatorios', '/app/cartoes/123']) {
      expect(metadadosDaRota(rota).indexavel).toBe(false);
    }
  });

  it('nunca indexa a página de convite', () => {
    // O link do convite é credencial: quem o abre pode se cadastrar e ver dados
    // financeiros de outra pessoa.
    expect(metadadosDaRota('/convite/qualquer-token').indexavel).toBe(false);
  });

  it('dá título e descrição próprios a cada rota pública', () => {
    const titulos = ROTAS_PUBLICAS.map((rota) => metadadosDaRota(rota).titulo);

    // Título repetido entre páginas faz o buscador tratá-las como duplicadas.
    expect(new Set(titulos).size).toBe(titulos.length);

    for (const rota of ROTAS_PUBLICAS) {
      const { descricao } = metadadosDaRota(rota);

      expect(descricao.length).toBeGreaterThan(20);
      // Descrição acima de ~160 caracteres é cortada no resultado da busca.
      expect(descricao.length).toBeLessThanOrEqual(170);
    }
  });
});
