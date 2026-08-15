/**
 * Normalização de e-mail.
 *
 * "Ana@Exemplo.com" e "ana@exemplo.com" são a mesma caixa postal. O banco tem um unique
 * simples em `email`, que é sensível a caixa — se cada tela gravar do seu jeito, nascem
 * duas contas para a mesma pessoa e o login fica ambíguo. A normalização acontece na
 * borda: tudo que entra passa por aqui antes de virar consulta ou registro.
 *
 * Um índice funcional em lower(email) resolveria no banco, mas o Prisma não representa
 * índice funcional no schema e passaria a acusar divergência em toda migration.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
