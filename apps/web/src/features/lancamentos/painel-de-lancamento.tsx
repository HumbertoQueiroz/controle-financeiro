import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ROTULO_DA_FORMA_DE_PAGAMENTO, type Direcao } from '@controle/shared';
import { api } from '@/lib/api';
import { hoje, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Painel } from '@/components/ui/painel';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  direcao: Direcao;
}

/**
 * Lançamento novo: avulso ou recorrente, no mesmo painel.
 *
 * A escolha entre os dois é uma pergunta só — "se repete todo mês?" — porque para quem
 * lança é a mesma tarefa. Separar em duas telas obrigaria a decidir antes de saber o que
 * muda, e o que muda é só o campo de vigência.
 */
export function PainelDeLancamento({ aberto, aoFechar, direcao }: Props) {
  const clienteDeQuery = useQueryClient();
  const [recorrente, setRecorrente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const invalidar = () =>
    Promise.all([
      clienteDeQuery.invalidateQueries({ queryKey: ['lancamentos'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['orcamento'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['recorrencias'] }),
      clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] }),
    ]);

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      api.post(recorrente ? '/recorrencias' : '/lancamentos', dados),
    onSuccess: async () => {
      setErro(null);
      await invalidar();
      aoFechar();
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const contraparte = String(dados.get('contraparte') ?? '').trim();

    salvar.mutate({
      direcao,
      descricao: String(dados.get('descricao')),
      valor: String(dados.get('valor')),
      formaDePagamento: String(dados.get('formaDePagamento')),
      ...(contraparte ? { contraparte } : {}),
      ...(recorrente
        ? {
            diaDoVencimento: Number(dados.get('diaDoVencimento')),
            inicioEm: String(dados.get('inicioEm')),
            ...(String(dados.get('fimEm') ?? '') ? { fimEm: String(dados.get('fimEm')) } : {}),
          }
        : { vencimento: String(dados.get('vencimento')) }),
    });
  };

  const ehEntrada = direcao === 'RECEIVABLE';

  return (
    <Painel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={ehEntrada ? 'Nova entrada' : 'Nova saída'}
      descricao={
        ehEntrada
          ? 'Salário, reembolso, venda — o que entra no seu caixa.'
          : 'Aluguel, assinatura, conta — o que sai do seu caixa.'
      }
    >
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <Campo rotulo="Descrição">
          {(id) => (
            <Input
              id={id}
              name="descricao"
              placeholder={ehEntrada ? 'Salário' : 'Aluguel'}
              required
              autoFocus
            />
          )}
        </Campo>

        <Campo rotulo="Valor">
          {(id) => (
            <Input
              id={id}
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              required
            />
          )}
        </Campo>

        <Campo
          rotulo={ehEntrada ? 'De quem (opcional)' : 'Para quem (opcional)'}
          auxilio="Quem paga ou recebe, quando não é alguém do seu cadastro."
        >
          {(id) => (
            <Input id={id} name="contraparte" placeholder={ehEntrada ? 'Empresa' : 'Imobiliária'} />
          )}
        </Campo>

        <Campo rotulo="Forma de pagamento">
          {(id) => (
            <Select id={id} name="formaDePagamento" defaultValue="CASH">
              {Object.entries(ROTULO_DA_FORMA_DE_PAGAMENTO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </Select>
          )}
        </Campo>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie-2">
          <input
            type="checkbox"
            checked={recorrente}
            onChange={(evento) => setRecorrente(evento.target.checked)}
            className="h-4 w-4"
          />
          Se repete todo mês
        </label>

        {recorrente ? (
          <>
            <Campo rotulo="Dia do vencimento" auxilio="Em meses curtos, cai no último dia.">
              {(id) => (
                <Input
                  id={id}
                  name="diaDoVencimento"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={5}
                  required
                />
              )}
            </Campo>

            <div className="flex gap-3">
              <div className="flex-1">
                <Campo rotulo="A partir de">
                  {(id) => (
                    <Input
                      id={id}
                      name="inicioEm"
                      type="month"
                      defaultValue={mesAtual()}
                      required
                    />
                  )}
                </Campo>
              </div>

              <div className="flex-1">
                <Campo rotulo="Até (opcional)">
                  {(id) => <Input id={id} name="fimEm" type="month" />}
                </Campo>
              </div>
            </div>
          </>
        ) : (
          <Campo rotulo="Vencimento">
            {(id) => <Input id={id} name="vencimento" type="date" defaultValue={hoje()} required />}
          </Campo>
        )}

        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}

        <Button type="submit" largura="cheia" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Painel>
  );
}
