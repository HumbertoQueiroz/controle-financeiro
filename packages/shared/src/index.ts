/**
 * Contratos compartilhados entre a API e a web.
 *
 * O que mora aqui são os schemas Zod de validação e os tipos derivados deles. A razão
 * de existir deste pacote é que a mesma regra valide os dois lados: a API valida a
 * requisição e o formulário valida antes de enviar, sem duas cópias da regra que
 * divergem na primeira alteração.
 */

export const PLACEHOLDER = 'shared';
