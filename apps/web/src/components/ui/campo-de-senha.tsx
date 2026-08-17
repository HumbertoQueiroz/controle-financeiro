import { useId, useState, type InputHTMLAttributes } from 'react';
import { Check, Eye, EyeSlash, X } from '@phosphor-icons/react';
import { TAMANHO_MINIMO_SENHA, requisitosDaSenha } from '@controle/shared';
import { cn } from '@/lib/utils';
import { Input } from './campo';

interface CampoDeSenhaProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  rotulo?: string;
  /** Falso na tela de login e no campo de senha atual, onde a régua não faz sentido. */
  exigirForca?: boolean;
}

/**
 * Campo de senha com a régua de exigências à vista.
 *
 * A régua aparece **antes** de a pessoa errar, e não como mensagem de recusa depois do
 * envio: quem já escolheu uma senha e a viu recusada tende a emendar um `1!` no fim, que é
 * exatamente o que os ataques de dicionário tentam primeiro. Mostrar as regras enquanto ela
 * digita faz a senha nascer forte em vez de virar forte a contragosto.
 *
 * O botão de revelar existe pelo mesmo motivo: senha invisível empurra para a senha curta,
 * porque é a única que dá para digitar sem errar.
 */
export function CampoDeSenha({
  rotulo = 'Senha',
  exigirForca = true,
  className,
  onChange,
  ...props
}: CampoDeSenhaProps) {
  const id = useId();
  const idDaRegua = `${id}-regua`;
  const [valor, setValor] = useState('');
  const [revelada, setRevelada] = useState(false);

  const requisitos = requisitosDaSenha(valor);
  const pendentes = requisitos.filter((requisito) => !requisito.atendido).length;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
      </label>

      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={revelada ? 'text' : 'password'}
          autoComplete={exigirForca ? 'new-password' : 'current-password'}
          minLength={exigirForca ? TAMANHO_MINIMO_SENHA : undefined}
          aria-describedby={exigirForca ? idDaRegua : undefined}
          className={className}
          onChange={(evento) => {
            setValor(evento.target.value);
            onChange?.(evento);
          }}
          {...props}
        />

        <button
          type="button"
          onClick={() => setRevelada((atual) => !atual)}
          aria-label={revelada ? 'Ocultar a senha' : 'Mostrar a senha'}
          aria-pressed={revelada}
          className="flex size-11 shrink-0 items-center justify-center rounded-padrao border border-borda text-texto-suave transition-colors hover:border-texto-suave hover:text-texto"
        >
          {revelada ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>

      {exigirForca && (
        <ul id={idDaRegua} className="flex flex-col gap-1 pt-1">
          {requisitos.map((requisito) => (
            <li
              key={requisito.id}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                requisito.atendido ? 'text-positivo' : 'text-texto-suave',
              )}
            >
              {/* Ícone além da cor: quem não distingue verde de cinza precisa do símbolo. */}
              {requisito.atendido ? (
                <Check size={14} weight="bold" aria-hidden />
              ) : (
                <X size={14} aria-hidden />
              )}
              {requisito.rotulo}
            </li>
          ))}
        </ul>
      )}

      {/* Um resumo só para leitor de tela: percorrer a lista inteira a cada tecla seria
          insuportável, mas saber quantas regras faltam é a informação que importa. */}
      {exigirForca && (
        <p role="status" className="sr-only">
          {pendentes === 0 ? 'A senha atende a todas as exigências' : `${pendentes} exigências`}
        </p>
      )}
    </div>
  );
}
