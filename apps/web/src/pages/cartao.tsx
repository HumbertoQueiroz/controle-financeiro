import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadSimple } from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Fatura, ResultadoDaImportacao } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData, formatarMes, mesAtual } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/campo';
import { Cartao, TituloDaSecao } from '@/components/ui/cartao';
import { Carregando, Erro, Vazio } from '@/components/ui/estados';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

const ROTULO_DO_STATUS: Record<Fatura['status'], string> = {
  OPEN: 'Em aberto',
  CLOSED: 'Fechada',
  PAID: 'Paga',
};

export function DetalheDoCartao() {
  const { id = '' } = useParams();
  const clienteDeQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const referenciaDoArquivo = useRef<HTMLInputElement>(null);

  const faturas = useQuery({
    queryKey: ['faturas', id],
    queryFn: () => api.get<Fatura[]>(`/cartoes/${id}/faturas`),
  });

  const importar = useMutation({
    mutationFn: (formulario: FormData) =>
      api.enviarArquivo<ResultadoDaImportacao>(`/cartoes/${id}/importacoes`, formulario),
    onSuccess: async (dados) => {
      setErro(null);
      setAberto(false);
      setResultado(dados);
      await clienteDeQuery.invalidateQueries({ queryKey: ['faturas', id] });
      await clienteDeQuery.invalidateQueries({ queryKey: ['resumo'] });
    },
    onError: (falha) =>
      setErro(falha instanceof Error ? falha.message : 'Não foi possível importar'),
  });

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const arquivo = referenciaDoArquivo.current?.files?.[0];

    if (!arquivo) {
      setErro('Escolha o arquivo CSV da fatura');
      return;
    }

    const formulario = new FormData();
    formulario.append('mesDeReferencia', String(new FormData(evento.currentTarget).get('mes')));
    formulario.append('arquivo', arquivo);

    importar.mutate(formulario);
  };

  return (
    <>
      <TituloDaSecao
        titulo="Faturas"
        acao={
          <Button onClick={() => setAberto(true)}>
            <UploadSimple size={18} aria-hidden />
            Importar CSV
          </Button>
        }
      />

      {faturas.isLoading && <Carregando />}
      {faturas.isError && (
        <Erro mensagem="Não foi possível carregar" aoTentarDeNovo={() => faturas.refetch()} />
      )}

      {faturas.data?.length === 0 && (
        <Vazio
          titulo="Nenhuma fatura ainda"
          descricao="Importe o CSV da fatura do seu banco para ver os lançamentos aqui."
          acao={<Button onClick={() => setAberto(true)}>Importar CSV</Button>}
        />
      )}

      {faturas.data && faturas.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {faturas.data.map((fatura) => (
            <li key={fatura.id}>
              <Link to={`/app/faturas/${fatura.id}`}>
                <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 hover:bg-superficie-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium text-texto">{formatarMes(fatura.mesDeReferencia)}</p>
                    <p className="text-xs text-texto-suave">
                      {ROTULO_DO_STATUS[fatura.status]} · vence {formatarData(fatura.vencimento)}
                    </p>
                  </div>

                  <Valor valor={fatura.total} />
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Painel
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Importar fatura"
        descricao="Você pode importar a mesma fatura várias vezes: nada é duplicado."
      >
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <Campo rotulo="Mês de referência">
            {(campoId) => (
              <Input id={campoId} name="mes" type="month" defaultValue={mesAtual()} required />
            )}
          </Campo>

          <Campo rotulo="Arquivo CSV" auxilio="O arquivo que você baixou do seu banco.">
            {(campoId) => (
              <input
                id={campoId}
                ref={referenciaDoArquivo}
                type="file"
                accept=".csv,text/csv"
                required
                className="min-h-11 w-full rounded-[--radius-padrao] border border-borda bg-superficie px-3 py-2 text-sm text-texto file:mr-3 file:rounded-md file:border-0 file:bg-superficie-2 file:px-3 file:py-1.5 file:text-sm file:text-texto"
              />
            )}
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-negativo">
              {erro}
            </p>
          )}

          <Button type="submit" largura="cheia" disabled={importar.isPending}>
            {importar.isPending ? 'Importando…' : 'Importar'}
          </Button>
        </form>
      </Painel>

      <ResultadoDaImportacaoPainel resultado={resultado} aoFechar={() => setResultado(null)} />
    </>
  );
}

/**
 * O que aconteceu na importação — inclusive o que foi ignorado.
 *
 * Mostrar só "importado com sucesso" faria a reimportação parecer que não fez nada. O
 * usuário precisa ver que as linhas repetidas foram reconhecidas, e não perdidas.
 */
function ResultadoDaImportacaoPainel({
  resultado,
  aoFechar,
}: {
  resultado: ResultadoDaImportacao | null;
  aoFechar: () => void;
}) {
  return (
    <Painel
      aberto={Boolean(resultado)}
      aoFechar={aoFechar}
      titulo="Importação concluída"
      rodape={<Button onClick={aoFechar}>Fechar</Button>}
    >
      {resultado && (
        <dl className="flex flex-col gap-2">
          <Linha rotulo="Formato reconhecido" valor={resultado.layout} />
          <Linha rotulo="Lançamentos novos" valor={String(resultado.lancamentosInseridos)} />
          <Linha
            rotulo="Já existiam (não duplicados)"
            valor={String(resultado.lancamentosIgnorados)}
          />
          <Linha rotulo="Pagamentos registrados" valor={String(resultado.pagamentosRegistrados)} />
          {resultado.pagamentosIgnorados > 0 && (
            <Linha
              rotulo="Pagamentos ignorados"
              valor={`${resultado.pagamentosIgnorados} (fatura não estava em aberto)`}
            />
          )}
          <Linha rotulo="Total da fatura" valor={resultado.totalDaFatura} />
        </dl>
      )}
    </Painel>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borda pb-2 last:border-0">
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd className="text-sm font-medium text-texto">{valor}</dd>
    </div>
  );
}
