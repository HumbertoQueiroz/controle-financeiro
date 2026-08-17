import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InputDeTelefone } from './campo';

describe('campo de whatsapp', () => {
  const campo = () => screen.getByRole('textbox') as HTMLInputElement;

  it('descarta tudo que não for dígito', async () => {
    render(<InputDeTelefone aria-label="WhatsApp" />);

    await userEvent.type(campo(), '(65) 99645-2787');

    expect(campo().value).toBe('65996452787');
  });

  it('para em onze dígitos', async () => {
    render(<InputDeTelefone aria-label="WhatsApp" />);

    await userEvent.type(campo(), '65996452787kjh...jk.kb.545');

    expect(campo().value).toBe('65996452787');
  });

  it('descarta o código do país em vez de cortar o número pela frente', async () => {
    render(<InputDeTelefone aria-label="WhatsApp" />);

    // Cortar os onze primeiros dígitos daria 55659964527 — um número que não é o de
    // ninguém e ainda assim passaria pela validação de tamanho.
    await userEvent.click(campo());
    await userEvent.paste('+55 65 99645-2787');

    expect(campo().value).toBe('65996452787');
  });

  it('limpa junto com o formulário', async () => {
    render(
      <form>
        <InputDeTelefone aria-label="WhatsApp" name="telefone" />
        <button type="reset">Limpar</button>
      </form>,
    );

    await userEvent.type(campo(), '65996452787');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(campo().value).toBe('');
  });
});
