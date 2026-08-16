import { Link } from 'react-router-dom';

/**
 * Caixas de aceite dos documentos legais.
 *
 * **Nunca pré-marcadas** — consentimento pré-marcado não é consentimento, e é o erro que
 * mais aparece em autuação de LGPD. Os links abrem em nova aba para a pessoa ler sem
 * perder o que já preencheu.
 */
export function AceiteDeTermos() {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-2 rounded-padrao p-1 text-sm text-texto transition-colors hover:bg-superficie-2">
        <input type="checkbox" name="aceitaTermos" required className="mt-1 h-4 w-4 shrink-0" />
        <span>
          Li e aceito os{' '}
          <Link
            to="/termos"
            target="_blank"
            className="text-destaque underline transition-opacity hover:opacity-80"
          >
            Termos de Uso
          </Link>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 rounded-padrao p-1 text-sm text-texto transition-colors hover:bg-superficie-2">
        <input
          type="checkbox"
          name="aceitaPrivacidade"
          required
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span>
          Li e aceito a{' '}
          <Link
            to="/privacidade"
            target="_blank"
            className="text-destaque underline transition-opacity hover:opacity-80"
          >
            Política de Privacidade
          </Link>
        </span>
      </label>
    </div>
  );
}
