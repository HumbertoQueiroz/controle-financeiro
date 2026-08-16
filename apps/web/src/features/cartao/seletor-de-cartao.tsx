import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { Cartao } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/campo';
import { Cartao as CartaoUi } from '@/components/ui/cartao';

/**
 * Escolhe o cartão da importação, com cadastro na hora.
 *
 * Cadastrar aqui evita o caminho que trava: a pessoa baixa a fatura, abre a importação e
 * descobre que precisa sair para cadastrar o cartão — e volta tendo de recomeçar.
 */
export function SeletorDeCartao({
  cartoes,
  valor,
  aoMudar,
}: {
  cartoes: Cartao[];
  valor: string;
  aoMudar: (cartaoId: string) => void;
}) {
  const clienteDeQuery = useQueryClient();
  const [cadastrando, setCadastrando] = useState(cartoes.length === 0);
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.post<Cartao>('/cartoes', dados),
    onSuccess: async (cartao) => {
      setErro(null);
      await clienteDeQuery.invalidateQueries({ queryKey: ['cartoes'] });
      aoMudar(cartao.id);
      setCadastrando(false);
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    evento.stopPropagation();

    const dados = new FormData(evento.currentTarget);

    criar.mutate({
      nome: String(dados.get('nome')),
      finalDoCartao: String(dados.get('finalDoCartao') ?? '') || undefined,
      diaDeFechamento: Number(dados.get('diaDeFechamento')),
      diaDeVencimento: Number(dados.get('diaDeVencimento')),
      compartilhado: dados.get('compartilhado') === 'on',
    });
  };

  if (cadastrando) {
    return (
      <CartaoUi className="flex flex-col gap-4 bg-superficie-2 p-4">
        <p className="text-sm font-medium text-texto">Novo cartão</p>

        {/* Formulário aninhado não é permitido em HTML: os campos vivem soltos e o envio
            é disparado por botão, não por submit. */}
        <div className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(id) => (
              <Input id={id} name="nome" form="form-cartao-inline" placeholder="Nubank" required />
            )}
          </Campo>

          <Campo rotulo="4 últimos dígitos (opcional)">
            {(id) => (
              <Input
                id={id}
                name="finalDoCartao"
                form="form-cartao-inline"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
              />
            )}
          </Campo>

          <div className="flex gap-3">
            <div className="flex-1">
              <Campo rotulo="Fechamento">
                {(id) => (
                  <Input
                    id={id}
                    name="diaDeFechamento"
                    form="form-cartao-inline"
                    type="number"
                    min={1}
                    max={31}
                    required
                  />
                )}
              </Campo>
            </div>

            <div className="flex-1">
              <Campo rotulo="Vencimento">
                {(id) => (
                  <Input
                    id={id}
                    name="diaDeVencimento"
                    form="form-cartao-inline"
                    type="number"
                    min={1}
                    max={31}
                    required
                  />
                )}
              </Campo>
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao px-1 text-sm text-texto transition-colors hover:bg-superficie">
            <input
              type="checkbox"
              name="compartilhado"
              form="form-cartao-inline"
              className="h-4 w-4"
            />
            Cartão compartilhado com outras pessoas
          </label>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {cartoes.length > 0 && (
              <Button variante="secundaria" tamanho="pequeno" onClick={() => setCadastrando(false)}>
                Cancelar
              </Button>
            )}

            <Button
              tamanho="pequeno"
              onClick={() =>
                (
                  document.getElementById('form-cartao-inline') as HTMLFormElement | null
                )?.requestSubmit()
              }
              disabled={criar.isPending}
            >
              {criar.isPending ? 'Salvando…' : 'Salvar cartão'}
            </Button>
          </div>
        </div>

        <form id="form-cartao-inline" onSubmit={aoEnviar} className="hidden" />
      </CartaoUi>
    );
  }

  return (
    <Campo rotulo="Cartão">
      {(id) => (
        <Select
          id={id}
          value={valor}
          onChange={(evento) => {
            if (evento.target.value === '__novo__') {
              setCadastrando(true);
              return;
            }

            aoMudar(evento.target.value);
          }}
          required
        >
          {cartoes.map((cartao) => (
            <option key={cartao.id} value={cartao.id}>
              {cartao.nome}
              {cartao.finalDoCartao ? ` · final ${cartao.finalDoCartao}` : ''}
              {cartao.compartilhado ? ' · compartilhado' : ''}
            </option>
          ))}

          <option value="__novo__">+ Cadastrar cartão…</option>
        </Select>
      )}
    </Campo>
  );
}
