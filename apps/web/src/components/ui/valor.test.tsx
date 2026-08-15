import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Valor } from './valor';

describe('exibição de valor', () => {
  it('formata em reais', () => {
    render(<Valor valor="1234.56" />);

    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it('mostra o sinal junto da cor, nunca só a cor', () => {
    const { container } = render(<Valor valor="120.00" tom="automatico" />);

    // Quem não distingue verde de vermelho — cerca de 8% dos homens — leria uma coluna
    // inteira de números sem saber quais são dívida. O sinal é o que carrega o
    // significado; a cor apenas reforça.
    expect(container.textContent).toContain('+');
    expect(container.firstElementChild?.className).toContain('text-positivo');
  });

  it('marca valor negativo com o sinal que o formatador já traz', () => {
    const { container } = render(<Valor valor="-80.00" tom="automatico" />);

    expect(container.textContent).toMatch(/-\s?R\$\s?80,00/);
    expect(container.firstElementChild?.className).toContain('text-negativo');
  });

  it('não põe sinal em valor neutro', () => {
    const { container } = render(<Valor valor="50.00" />);

    expect(container.textContent).not.toContain('+');
  });

  it('usa fonte tabular para a coluna não dançar', () => {
    const { container } = render(<Valor valor="99.90" />);

    // Sem largura fixa de dígito, cada linha alinha diferente e conferir fatura vira
    // trabalho de encontrar o número.
    expect(container.firstElementChild?.className).toContain('dinheiro');
  });
});
