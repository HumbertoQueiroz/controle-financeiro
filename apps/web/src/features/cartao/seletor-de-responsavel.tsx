import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Pessoa } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/campo';

/**
 * Escolhe quem paga o lançamento, com cadastro na hora.
 *
 * O cadastro inline existe porque a pessoa aparece **durante** a classificação: descobrir
 * no meio da fatura que o gasto foi do Bruno e ter de sair da tela para cadastrá-lo faria
 * perder tudo que já havia sido classificado.
 *
 * O padrão é "Meu" — na maioria das linhas a compra é de quem é dono do cartão, e obrigar
 * a escolher em cada uma seria trabalho repetido.
 */
export function SeletorDeResponsavel({
  valor,
  aoMudar,
  rotulo,
}: {
  valor: string | null;
  aoMudar: (pessoaId: string | null) => void;
  rotulo: string;
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

  if (cadastrando) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Nome da pessoa"
          aria-label="Nome da pessoa"
          autoFocus
          className="text-xs"
        />

        <Button
          tamanho="pequeno"
          onClick={() => nome.trim().length >= 2 && criar.mutate(nome.trim())}
          disabled={criar.isPending}
        >
          Salvar
        </Button>

        <Button variante="fantasma" tamanho="pequeno" onClick={() => setCadastrando(false)}>
          Cancelar
        </Button>
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
      className="text-xs"
    >
      <option value="">Meu</option>

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
