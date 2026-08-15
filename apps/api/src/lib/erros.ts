/**
 * Erros de domínio com status HTTP associado.
 *
 * O `service` lança estes; quem traduz para resposta é o error handler. É o que mantém a
 * regra de negócio sem `reply.code(...)` espalhado — e o que permite testar a regra sem
 * simular uma requisição.
 */
export class ErroDeDominio extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401 — não sabemos quem é. */
export class ErroDeAutenticacao extends ErroDeDominio {
  constructor(message = 'Não autenticado') {
    super(message, 401, 'NAO_AUTENTICADO');
  }
}

/** 403 — sabemos quem é, e essa pessoa não pode. */
export class ErroDeAcesso extends ErroDeDominio {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'ACESSO_NEGADO');
  }
}

/** 404 */
export class ErroNaoEncontrado extends ErroDeDominio {
  constructor(message = 'Não encontrado') {
    super(message, 404, 'NAO_ENCONTRADO');
  }
}

/** 409 — o pedido é válido, mas conflita com o estado atual. */
export class ErroDeConflito extends ErroDeDominio {
  constructor(message: string) {
    super(message, 409, 'CONFLITO');
  }
}

/** 422 — regra de negócio violada. */
export class ErroDeRegra extends ErroDeDominio {
  constructor(message: string) {
    super(message, 422, 'REGRA_VIOLADA');
  }
}
