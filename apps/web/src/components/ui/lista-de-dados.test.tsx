import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListaDeDados, type ColunaDaLista } from './lista-de-dados';

interface Linha {
  id: string;
  descricao: string;
  valor: string;
  origem: string;
}

const itens: Linha[] = [
  { id: '1', descricao: 'Mercado', valor: '120,50', origem: 'Fatura' },
  { id: '2', descricao: 'Bebidas', valor: '96,00', origem: 'Rateio' },
];

const colunas: ColunaDaLista<Linha>[] = [
  { chave: 'descricao', titulo: 'Descrição', principal: true, render: (i) => i.descricao },
  { chave: 'origem', titulo: 'Origem', render: (i) => i.origem, ocultarNoCelular: true },
  { chave: 'valor', titulo: 'Valor', alinharADireita: true, render: (i) => i.valor },
];

describe('lista de dados', () => {
  it('renderiza cartões e tabela, deixando o CSS escolher pela largura', () => {
    const { container } = render(
      <ListaDeDados itens={itens} colunas={colunas} chaveDoItem={(i) => i.id} />,
    );

    // Os dois layouts existem no HTML; `md:hidden` e `hidden md:block` decidem qual
    // aparece. Trocar por JavaScript exigiria medir a janela e causaria salto na primeira
    // renderização.
    expect(container.querySelector('ul')?.className).toContain('md:hidden');
    expect(container.querySelector('table')?.parentElement?.className).toContain('md:block');
  });

  it('mostra todos os registros', () => {
    render(<ListaDeDados itens={itens} colunas={colunas} chaveDoItem={(i) => i.id} />);

    // Uma vez no cartão e uma na tabela.
    expect(screen.getAllByText('Mercado')).toHaveLength(2);
    expect(screen.getAllByText('96,00')).toHaveLength(2);
  });

  it('esconde no cartão a coluna marcada como secundária', () => {
    const { container } = render(
      <ListaDeDados itens={itens} colunas={colunas} chaveDoItem={(i) => i.id} />,
    );

    const cartoes = container.querySelector('ul');

    // "Origem" é detalhe que não cabe em 375px e não é essencial para conferir a conta.
    expect(cartoes?.textContent).not.toContain('Fatura');
    expect(container.querySelector('table')?.textContent).toContain('Fatura');
  });

  it('vira botão quando é clicável, para receber foco pelo teclado', async () => {
    const aoClicar = vi.fn();

    render(
      <ListaDeDados
        itens={itens}
        colunas={colunas}
        chaveDoItem={(i) => i.id}
        aoClicarNoItem={aoClicar}
      />,
    );

    // `div` com onClick não recebe foco nem é anunciado como acionável pelo leitor de tela.
    const botoes = screen.getAllByRole('button');
    expect(botoes).toHaveLength(2);

    await userEvent.click(botoes[0]!);
    expect(aoClicar).toHaveBeenCalledWith(itens[0]);
  });

  it('não vira botão quando não há ação', () => {
    render(<ListaDeDados itens={itens} colunas={colunas} chaveDoItem={(i) => i.id} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
