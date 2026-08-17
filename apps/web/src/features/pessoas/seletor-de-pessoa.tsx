import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Pessoa } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/campo';

/**
 * Escolhe uma pessoa da agenda, com cadastro na hora.
 *
 * O cadastro inline existe porque a pessoa aparece **durante** a classificação: descobrir
 * no meio da fatura que o gasto foi do Bruno e ter de sair da tela para cadastrá-lo faria
 * perder tudo que já havia sido classificado.
 *
 * O padrão é "Meu" — na maioria das linhas a compra é de quem é dono do cartão, e obrigar
 * a escolher em cada uma seria trabalho repetido.
 */
export function SeletorDePessoa({
  valor,
  aoMudar,
  rotulo,
  rotuloVazio = 'Meu',
}: {
  valor: string | null;
  aoMudar: (pessoaId: string | null) => void;
  rotulo: string;
  /** O que a opção vazia diz. "Meu" na fatura, "Ninguém" num lançamento à mão. */
  rotuloVazio?: string;
}) {
  const clienteDeQuery = useQueryClient();
  const [cadastrando, setCadastrando] = useState(false);
  const [nome, setNome] = useState('');

  const pessoas = useQuery({ queryKey: ['pessoas'], queryFn: () => api.get<Pessoa[]>('/pessoas') });

  const criar = useMutation({
    mutationFn: (nomeNovo: string) => api.post<Pessoa>('/pessoas', { nome: nomeNovo }),
    onSuccess: async (pessoa) => {
      await clienteDeQuery.invalidateQueries({ queryKey: ['pessoas'] });
      aoMudar(pessoa.id);
      setCadastrando(false);
      setNome('');
    },
  });

  const salvar = () => {
    if (nome.trim().length >= 2) criar.mutate(nome.trim());
  };

  if (cadastrando) {
    return (
      // Campo em cima e botões embaixo, e não os três lado a lado: dividindo a mesma
      // coluna com "Salvar" e "Cancelar", o campo fica com uns 90px e não cabe um nome.
      <div className="flex flex-col gap-2">
        <Input
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter salva. Sem isto, o Enter borbulharia para o formulário da importação
            // e enviaria a classificação inteira com a pessoa ainda por cadastrar.
            if (evento.key === 'Enter') {
              evento.preventDefault();
              salvar();
            }
          }}
          placeholder="Nome da pessoa"
          aria-label="Nome da pessoa"
          autoFocus
        />

        <div className="flex items-center gap-2">
          <Button tamanho="pequeno" onClick={salvar} disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>

          <Button variante="fantasma" tamanho="pequeno" onClick={() => setCadastrando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Select
      aria-label={rotulo}
      value={valor ?? ''}
      onChange={(evento) => {
        if (evento.target.value === '__nova__') {
          setCadastrando(true);
          return;
        }

        aoMudar(evento.target.value || null);
      }}
    >
      <option value="">{rotuloVazio}</option>

      {pessoas.data
        ?.filter((pessoa) => pessoa.editavel)
        .map((pessoa) => (
          <option key={pessoa.id} value={pessoa.id}>
            {pessoa.nome}
          </option>
        ))}

      <option value="__nova__">+ Cadastrar pessoa…</option>
    </Select>
  );
}
