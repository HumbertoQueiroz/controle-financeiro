import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Categoria, Direcao } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/campo';

/**
 * Escolhe a categoria do lançamento, com cadastro na hora.
 *
 * Pelo mesmo motivo do responsável: a categoria que falta aparece **durante** a
 * classificação. Descobrir no meio da fatura que não existe "Farmácia" e ter de sair da
 * tela para criá-la faria perder tudo que já havia sido classificado.
 */
export function SeletorDeCategoria({
  valor,
  aoMudar,
  rotulo,
  direcao = 'PAYABLE',
}: {
  valor: string | null;
  aoMudar: (categoriaId: string | null) => void;
  rotulo: string;
  /** De que lado o lançamento está, para não oferecer categoria do lado oposto. */
  direcao?: Direcao;
}) {
  const clienteDeQuery = useQueryClient();
  const [cadastrando, setCadastrando] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get<Categoria[]>('/categorias'),
  });

  const criar = useMutation({
    mutationFn: (nomeNovo: string) => api.post<Categoria>('/categorias', { nome: nomeNovo }),
    onSuccess: async (categoria) => {
      await clienteDeQuery.invalidateQueries({ queryKey: ['categorias'] });
      aoMudar(categoria.id);
      setCadastrando(false);
      setNome('');
      setErro(null);
    },
    onError: (falha) => setErro(falha instanceof Error ? falha.message : 'Não foi possível criar'),
  });

  const salvar = () => {
    if (nome.trim().length >= 2) criar.mutate(nome.trim());
  };

  if (cadastrando) {
    return (
      <div className="flex flex-col gap-2">
        <Input
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter salva. Sem isto, ele borbulharia para o formulário da importação e
            // enviaria a classificação inteira com a categoria ainda por criar.
            if (evento.key === 'Enter') {
              evento.preventDefault();
              salvar();
            }
          }}
          placeholder="Nome da categoria"
          aria-label="Nome da categoria"
          autoFocus
        />

        {erro && (
          <p role="alert" className="text-xs text-negativo">
            {erro}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button tamanho="pequeno" onClick={salvar} disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>

          <Button
            variante="fantasma"
            tamanho="pequeno"
            onClick={() => {
              setCadastrando(false);
              setErro(null);
            }}
          >
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
      <option value="">Sem categoria</option>

      {/* Categoria de um lado não serve ao outro: "Salário" não é uma opção de despesa. */}
      {categorias.data
        ?.filter((categoria) => !categoria.direcao || categoria.direcao === direcao)
        .map((categoria) => (
          <option key={categoria.id} value={categoria.id}>
            {categoria.nome}
          </option>
        ))}

      <option value="__nova__">+ Cadastrar categoria…</option>
    </Select>
  );
}
