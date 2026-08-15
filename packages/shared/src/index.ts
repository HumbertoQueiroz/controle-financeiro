/**
 * Contratos compartilhados entre a API e a web.
 *
 * O que mora aqui são os schemas Zod de validação e os tipos derivados deles. A razão
 * de existir deste pacote é que a mesma regra valide os dois lados: a API valida a
 * requisição e o formulário valida antes de enviar, sem duas cópias da regra que
 * divergem na primeira alteração.
 */

export * from './schemas/senha.js';
export * from './schemas/auth.js';
export * from './schemas/usuario.js';
export * from './schemas/pessoa.js';
export * from './schemas/compartilhamento.js';
export * from './schemas/cartao.js';
export * from './schemas/grupo.js';
export * from './schemas/relatorio.js';
export * from './dinheiro.js';
export * from './rateio.js';
