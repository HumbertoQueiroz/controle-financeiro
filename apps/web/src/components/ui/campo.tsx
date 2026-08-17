import type { ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { CODIGO_DO_PAIS, DIGITOS_DO_TELEFONE } from '@controle/shared';
import { cn } from '@/lib/utils';

/**
 * Campo de formulário também reage ao ponteiro.
 *
 * Sem hover, um `select` parece texto até ser clicado — e numa tela de classificação com
 * dezenas deles, é o hover que diz onde dá para mexer.
 */
const baseDoControle =
  'min-h-11 w-full rounded-padrao border border-borda bg-superficie px-3 text-sm text-texto transition-colors placeholder:text-texto-suave hover:border-texto-suave disabled:pointer-events-none disabled:opacity-60';

interface CampoProps {
  rotulo: string;
  erro?: string;
  auxilio?: string;
  children: (id: string) => ReactNode;
}

/**
 * Rótulo, controle, ajuda e erro numa coluna.
 *
 * O erro é anunciado por `role="alert"` e ligado ao controle por `aria-describedby`: quem
 * usa leitor de tela precisa ouvir o motivo da recusa, não só descobrir que o formulário
 * não enviou.
 */
export function Campo({ rotulo, erro, auxilio, children }: CampoProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
      </label>

      {children(id)}

      {auxilio && !erro && <p className="text-xs text-texto-suave">{auxilio}</p>}
      {erro && (
        <p role="alert" className="text-xs text-negativo">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Duas casas é o que existe em dinheiro; o resto é ruído que o backend arredondaria. */
const CASAS_DECIMAIS = 2;

/**
 * Campo de texto, com as correções que todo `type="number"` precisa.
 *
 * O `number` nativo tem três defeitos que aparecem justo em tela de dinheiro:
 *
 * - **A roda do mouse altera o valor.** Basta o campo estar com foco e a pessoa rolar a
 *   página: o valor muda sem ninguém digitar nada, e ela só descobre ao conferir o extrato.
 *   É o pior dos três, porque não deixa rastro.
 * - **As setinhas** ocupam a lateral do campo e convidam a um clique que ninguém quer numa
 *   tela em que se digita o valor.
 * - **`e`, `E`, `+` e `-` passam**, porque o `number` aceita notação científica. "1e5" é um
 *   valor válido para o navegador e lixo para quem preencheu.
 */
export function Input({
  className,
  type,
  step,
  onWheel,
  onKeyDown,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const numerico = type === 'number';
  const dinheiro = numerico && String(step) === '0.01';

  return (
    <input
      type={type}
      step={step}
      className={cn(baseDoControle, numerico && 'sem-setinhas tabular-nums', className)}
      onWheel={
        numerico
          ? (evento) => {
              // Tirar o foco é o que impede a alteração — `preventDefault` no wheel só
              // travaria a rolagem da página, e o valor mudaria do mesmo jeito.
              if (document.activeElement === evento.currentTarget) evento.currentTarget.blur();
              onWheel?.(evento);
            }
          : onWheel
      }
      onKeyDown={
        numerico
          ? (evento) => {
              if (['e', 'E', '+'].includes(evento.key)) evento.preventDefault();
              onKeyDown?.(evento);
            }
          : onKeyDown
      }
      onChange={
        dinheiro
          ? (evento) => {
              const [inteiro, decimais] = evento.target.value.split('.');

              // Escrever de volta no elemento, e não guardar em estado: os formulários
              // daqui são não-controlados, e um `useState` quebraria o `form.reset()`.
              if (decimais && decimais.length > CASAS_DECIMAIS) {
                evento.target.value = `${inteiro}.${decimais.slice(0, CASAS_DECIMAIS)}`;
              }

              onChange?.(evento);
            }
          : onChange
      }
      {...props}
    />
  );
}

/**
 * Campo de WhatsApp que só guarda dígitos.
 *
 * O usuário digita ou cola do jeito que tem em mãos — `(65) 99645-2787`, `+55 65 9964 2787`,
 * um contato copiado da agenda com nome no meio — e o campo devolve `65996452787`. Deixar a
 * limpeza só para o backend faria o campo aceitar em silêncio um texto que vira convite
 * quebrado lá na frente, quando ninguém mais está olhando para o formulário.
 *
 * O corte em {@link DIGITOS_DO_TELEFONE} acontece na digitação, e não na validação, para o
 * excedente nunca chegar a existir no valor enviado.
 */
export function InputDeTelefone({
  className,
  defaultValue,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const aoMudar = (evento: ChangeEvent<HTMLInputElement>) => {
    // Escrever de volta no próprio elemento, em vez de guardar em estado, mantém o campo
    // não-controlado: `form.reset()` continua limpando, como nos outros campos da tela.
    evento.target.value = limparTelefone(evento.target.value);
    onChange?.(evento);
  };

  return (
    <Input
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      maxLength={DIGITOS_DO_TELEFONE}
      placeholder="11900000000"
      className={cn('tabular-nums', className)}
      defaultValue={defaultValue === undefined ? undefined : limparTelefone(String(defaultValue))}
      onChange={aoMudar}
      {...props}
    />
  );
}

function limparTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '');

  // Colar um número com o código do país é comum — a agenda do celular guarda assim. Cortar
  // os 11 primeiros dígitos de `5565996452787` daria `55659964527`, um número que não é o
  // da pessoa e ainda assim passaria pela validação. Descartar o `55` preserva o número.
  const semPais =
    digitos.length > DIGITOS_DO_TELEFONE && digitos.startsWith(CODIGO_DO_PAIS)
      ? digitos.slice(CODIGO_DO_PAIS.length)
      : digitos;

  return semPais.slice(0, DIGITOS_DO_TELEFONE);
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(baseDoControle, 'cursor-pointer pr-8', className)} {...props} />;
}
