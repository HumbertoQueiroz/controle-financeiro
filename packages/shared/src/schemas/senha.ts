import { z } from 'zod';

/**
 * O bcrypt trunca em 72 BYTES e ignora o resto sem avisar. Validar aqui, na borda,
 * evita que uma senha longa seja aceita no cadastro e depois valide errado no login —
 * e a contagem é em bytes porque cada caractere acentuado ocupa 2 em UTF-8.
 */
export const TAMANHO_MAXIMO_SENHA_BYTES = 72;
export const TAMANHO_MINIMO_SENHA = 10;

/**
 * Tamanho em bytes UTF-8, contado à mão.
 *
 * Sem `TextEncoder` (não tipado num pacote que roda no navegador e no Node) e sem
 * `Buffer` (só existe no Node). Esta é a função que a API e o formulário usam, para que
 * a senha aceita na tela seja exatamente a senha aceita no servidor — duas contagens
 * diferentes produziriam um cadastro que passa no cliente e falha no servidor.
 */
export function tamanhoEmBytes(texto: string): number {
  let bytes = 0;

  for (const caractere of texto) {
    const ponto = caractere.codePointAt(0) ?? 0;

    if (ponto <= 0x7f) bytes += 1;
    else if (ponto <= 0x7ff) bytes += 2;
    else if (ponto <= 0xffff) bytes += 3;
    else bytes += 4;
  }

  return bytes;
}

/**
 * Senhas que qualquer ataque de dicionário tenta nas primeiras tentativas.
 *
 * A lista é curta de propósito: ela não substitui uma base de senhas vazadas, mas corta o
 * que os exemplos de formulário ensinam as pessoas a digitar. Comparação sem acento, sem
 * caixa e sem separadores, porque `Senha@123` e `senha 123` são a mesma ideia.
 */
const SENHAS_OBVIAS = [
  '123456',
  '1234567890',
  'senha',
  'password',
  'qwerty',
  'qwertyuiop',
  'abc',
  'admin',
  'administrador',
  'controlefinanceiro',
  'iloveyou',
];

function nucleoDaSenha(senha: string): string {
  return senha
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Decide se a senha é uma das óbvias.
 *
 * A comparação é por igualdade, e não por "contém": um `includes` reprovaria
 * `RelatorioDeSenhas!7`, que é uma senha perfeitamente boa, só por trazer a palavra dentro.
 * O que a lista precisa pegar é a senha que **é** a palavra — com o tempero de sempre, os
 * dígitos no fim, que é como `senha` vira `Senha@123` e continua sendo a primeira tentativa
 * de qualquer dicionário. Daí comparar também a raiz, sem os dígitos finais.
 */
function ehObvia(nucleo: string): boolean {
  const raiz = nucleo.replace(/\d+$/, '');

  if (SENHAS_OBVIAS.includes(nucleo) || SENHAS_OBVIAS.includes(raiz)) return true;

  // Um caractere só, repetido: `Aaaaaaaaaa1!` cumpre as quatro classes, tem doze
  // caracteres e praticamente nenhuma entropia. A raiz é o que se testa, porque o dígito
  // do fim é justamente o tempero que faz a senha passar pela régua de composição.
  return /^(.)\1*$/.test(raiz.length > 0 ? raiz : nucleo);
}

/** Um requisito da senha e se a senha informada o cumpre. */
export interface RequisitoDaSenha {
  id: 'tamanho' | 'minuscula' | 'maiuscula' | 'numero' | 'simbolo' | 'obvia';
  rotulo: string;
  atendido: boolean;
}

/**
 * Avalia todos os requisitos de uma vez.
 *
 * Devolver a lista inteira, e não a primeira falha, é o que permite ao formulário mostrar
 * a régua completa enquanto a pessoa digita. Revelar um requisito por vez transforma a
 * criação de senha em tentativa e erro, e é o caminho mais curto para alguém desistir e
 * escolher o mínimo que passa.
 */
export function requisitosDaSenha(senha: string): RequisitoDaSenha[] {
  const nucleo = nucleoDaSenha(senha);

  return [
    {
      id: 'tamanho',
      rotulo: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`,
      atendido: senha.length >= TAMANHO_MINIMO_SENHA,
    },
    { id: 'minuscula', rotulo: 'Uma letra minúscula', atendido: /\p{Ll}/u.test(senha) },
    { id: 'maiuscula', rotulo: 'Uma letra maiúscula', atendido: /\p{Lu}/u.test(senha) },
    { id: 'numero', rotulo: 'Um número', atendido: /\d/.test(senha) },
    {
      id: 'simbolo',
      rotulo: 'Um símbolo, como ! ? @ ou -',
      atendido: /[^\p{L}\p{N}]/u.test(senha),
    },
    {
      id: 'obvia',
      rotulo: 'Não pode ser uma senha comum',
      // Só reprova quando há núcleo: senha vazia já é reprovada pelo tamanho, e marcar
      // este requisito de vermelho antes da primeira tecla acusaria quem não digitou nada.
      atendido: nucleo.length === 0 || !ehObvia(nucleo),
    },
  ];
}

export const senhaSchema = z
  .string()
  .superRefine((senha, contexto) => {
    // Todos os problemas de uma vez. Um `refine` por regra devolveria só o primeiro, e a
    // pessoa descobriria a exigência seguinte apenas depois de corrigir a anterior.
    for (const requisito of requisitosDaSenha(senha)) {
      if (!requisito.atendido) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: requisito.rotulo });
      }
    }
  })
  .refine(
    (senha) => tamanhoEmBytes(senha) <= TAMANHO_MAXIMO_SENHA_BYTES,
    `A senha é longa demais (limite de ${TAMANHO_MAXIMO_SENHA_BYTES} bytes; acentos ocupam 2)`,
  );
