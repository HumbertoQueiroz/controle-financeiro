/**
 * Versão corrente dos documentos legais.
 *
 * O aceite é gravado com a versão que a pessoa viu. Quando um documento muda, sobe-se a
 * versão aqui e o próximo login volta a pedir aceite — o registro antigo permanece, porque
 * ele é a evidência de que aquela pessoa consentiu com *aquele* texto. Guardar apenas
 * "aceitou: sim" não demonstra nada depois que o texto muda.
 *
 * Os documentos em si ficam em Docs/legal/, com o nome batendo com a versão.
 */
export const VERSAO_TERMOS = '1.0.0';
export const VERSAO_PRIVACIDADE = '1.0.0';
