import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Resumo } from '@controle/shared';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/utils';
import { useAutenticacao } from '@/auth/auth-context';
import { Cartao } from '@/components/ui/cartao';
import { Carregando, Erro } from '@/components/ui/estados';
import { Valor } from '@/components/ui/valor';

export function Painel() {
  const { usuario } = useAutenticacao();

  const resumo = useQuery({
    queryKey: ['resumo'],
    queryFn: () => api.get<Resumo>('/resumo'),
  });

  if (resumo.isLoading) return <Carregando linhas={4} />;
  if (resumo.isError) {
    return (
      <Erro
        mensagem="Não foi possível carregar seus números"
        aoTentarDeNovo={() => resumo.refetch()}
      />
    );
  }

  const dados = resumo.data!;

  return (
    <>
      <h1 className="text-lg font-semibold text-texto">Olá, {usuario?.nome.split(' ')[0]}</h1>

      {/* Saldo em destaque, sozinho: é o número que responde "como estou?" */}
      <Cartao className="flex flex-col gap-1 p-5">
        <p className="text-sm text-texto-suave">Saldo final</p>
        <Valor valor={dados.saldo} tom="automatico" tamanho="grande" />
        <p className="text-xs text-texto-suave">
          {Number(dados.saldo) < 0
            ? 'Você deve mais do que tem a receber'
            : 'Você tem a receber mais do que deve'}
        </p>
      </Cartao>

      {/* Dois cartões lado a lado já no celular: são números curtos e cabem */}
      <div className="flex gap-3">
        <Cartao className="flex flex-1 flex-col gap-1 p-4">
          <p className="text-xs text-texto-suave">A pagar</p>
          <Valor valor={dados.aPagar} tom="negativo" />
        </Cartao>

        <Cartao className="flex flex-1 flex-col gap-1 p-4">
          <p className="text-xs text-texto-suave">A receber</p>
          <Valor valor={dados.aReceber} tom="positivo" />
        </Cartao>
      </div>

      {dados.proximoVencimento && (
        <Cartao className="flex items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-texto">Próximo vencimento</p>
            <p className="text-xs text-texto-suave">{formatarData(dados.proximoVencimento)}</p>
          </div>
        </Cartao>
      )}

      <div className="flex flex-col gap-2">
        <Atalho
          para="/app/cartoes"
          titulo="Cartões"
          descricao={`${dados.faturasEmAberto} fatura(s) em aberto`}
        />
        <Atalho
          para="/app/grupos"
          titulo="Grupos"
          descricao="Rateio dos rolês e fechamento do mês"
        />
        <Atalho para="/app/pessoas" titulo="Pessoas" descricao="Quem participa das suas contas" />
      </div>
    </>
  );
}

function Atalho({ para, titulo, descricao }: { para: string; titulo: string; descricao: string }) {
  return (
    <Link to={para}>
      <Cartao className="flex min-h-14 items-center justify-between gap-3 p-4 hover:bg-superficie-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-texto">{titulo}</p>
          <p className="text-xs text-texto-suave">{descricao}</p>
        </div>
      </Cartao>
    </Link>
  );
}
