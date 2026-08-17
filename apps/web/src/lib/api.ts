const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export interface ErroDaApi {
  codigo: string;
  mensagem: string;
  campos?: { campo: string; mensagem: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly corpo: ErroDaApi,
  ) {
    super(corpo.mensagem);
    this.name = 'ApiError';
  }
}

/**
 * Cliente da API.
 *
 * `credentials: 'include'` em toda chamada porque a sessão vive num cookie httpOnly — não
 * há token em JavaScript para anexar, e é justamente isso que faz um XSS não virar roubo
 * de sessão.
 */
async function requisitar<T>(
  metodo: string,
  caminho: string,
  opcoes: { corpo?: unknown; formulario?: FormData } = {},
): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    credentials: 'include',
    ...(opcoes.formulario
      ? { body: opcoes.formulario }
      : opcoes.corpo !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opcoes.corpo) }
        : {}),
  });

  if (resposta.status === 204) {
    return undefined as T;
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    throw new ApiError(
      resposta.status,
      dados ?? { codigo: 'ERRO', mensagem: 'Não foi possível concluir' },
    );
  }

  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, { corpo }),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, { corpo }),
  put: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PUT', caminho, { corpo }),
  delete: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
  enviarArquivo: <T>(caminho: string, formulario: FormData) =>
    requisitar<T>('POST', caminho, { formulario }),
};
