import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ErroDeDominio } from '../lib/erros.js';

/**
 * Tradutor único de erro para resposta HTTP.
 *
 * Centralizar aqui é o que permite a garantia de privacidade: nenhuma mensagem de erro
 * carrega dado pessoal para fora. O detalhe cru vai para o log, e o cliente recebe uma
 * frase que descreve o problema sem repetir e-mail, valor ou descrição de lançamento.
 */
export default fp(async (app) => {
  app.setErrorHandler((erro, request, reply) => {
    if (erro instanceof ErroDeDominio) {
      return reply.status(erro.status).send({ codigo: erro.codigo, mensagem: erro.message });
    }

    if (erro instanceof ZodError) {
      return reply.status(400).send({
        codigo: 'DADOS_INVALIDOS',
        mensagem: 'Dados inválidos',
        campos: erro.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensagem: issue.message,
        })),
      });
    }

    // O Fastify converte falha de validação de schema antes de chegar como ZodError.
    if (typeof erro === 'object' && erro !== null && 'validation' in erro && erro.validation) {
      return reply.status(400).send({ codigo: 'DADOS_INVALIDOS', mensagem: 'Dados inválidos' });
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 é violação de unique. A mensagem do Prisma cita a coluna e às vezes o valor;
      // devolvê-la permitiria descobrir se um e-mail existe só tentando cadastrá-lo.
      if (erro.code === 'P2002') {
        return reply.status(409).send({ codigo: 'CONFLITO', mensagem: 'Registro já existe' });
      }

      if (erro.code === 'P2025') {
        return reply.status(404).send({ codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado' });
      }
    }

    request.log.error({ err: erro }, 'erro não tratado');

    return reply.status(500).send({ codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' });
  });
});
