import { useQuery } from '@tanstack/react-query';
import { CreditCard, MagnifyingGlass, Receipt, User, UsersThree } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResultadoDaBusca, ResultadosDaBusca } from '@controle/shared';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/campo';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

const ICONE: Record<ResultadoDaBusca['tipo'], typeof Receipt> = {
  LANCAMENTO: Receipt,
  PESSOA: User,
  CARTAO: CreditCard,
  GRUPO: UsersThree,
};

/**
 * Busca em tudo, num painel.
 *
 * O termo é debounced em 300ms: a busca varre quatro tabelas, e disparar a cada tecla
 * mandaria seis requisições para escrever "mercado", das quais só a última interessa.
 */
export function PainelDeBusca({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [termoAtrasado, setTermoAtrasado] = useState('');

  useEffect(() => {
    const relogio = setTimeout(() => setTermoAtrasado(termo.trim()), 300);

    return () => clearTimeout(relogio);
  }, [termo]);

  // Limpa ao fechar: reabrir com o resultado da busca anterior faria parecer que a tela
  // não respondeu ao novo termo enquanto a requisição não volta.
  useEffect(() => {
    if (!aberto) {
      setTermo('');
      setTermoAtrasado('');
    }
  }, [aberto]);

  const resultados = useQuery({
    queryKey: ['busca', termoAtrasado],
    queryFn: () => api.get<ResultadosDaBusca>(`/busca?q=${encodeURIComponent(termoAtrasado)}`),
    enabled: aberto && termoAtrasado.length >= 2,
  });

  const ir = (link: string) => {
    aoFechar();
    navegar(link);
  };

  return (
    <Painel aberto={aberto} aoFechar={aoFechar} titulo="Buscar">
      <div className="flex flex-col gap-3">
        <Input
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder="Descrição, pessoa, cartão ou grupo"
          aria-label="O que procurar"
          autoFocus
        />

        {termoAtrasado.length > 0 && termoAtrasado.length < 2 && (
          <p className="text-xs text-texto-suave">Digite ao menos 2 caracteres.</p>
        )}

        {resultados.data?.itens.length === 0 && (
          <p className="text-sm text-texto-suave">Nada encontrado para “{termoAtrasado}”.</p>
        )}

        <ul className="flex flex-col gap-1">
          {resultados.data?.itens.map((item) => {
            const Icone = ICONE[item.tipo];

            return (
              <li key={`${item.tipo}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => ir(item.link)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-padrao p-2 text-left transition-colors hover:bg-superficie-2"
                >
                  <Icone size={18} aria-hidden className="shrink-0 text-texto-suave" />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-texto">{item.titulo}</span>
                    <span className="truncate text-xs text-texto-suave">{item.detalhe}</span>
                  </div>

                  {item.valor && <Valor valor={item.valor} />}
                </button>
              </li>
            );
          })}
        </ul>

        {resultados.data?.truncado && (
          // Dizer que a lista foi cortada é obrigatório: sem isso, "não achei" e "achei
          // demais e escondi" ficam iguais na tela.
          <p className="text-xs text-texto-suave">
            Há mais resultados. Refine o termo para chegar ao que procura.
          </p>
        )}

        {!resultados.data && termoAtrasado.length < 2 && (
          <p className="flex items-center gap-1 text-xs text-texto-suave">
            <MagnifyingGlass size={14} aria-hidden />
            Procura em lançamentos, pessoas, cartões e grupos.
          </p>
        )}
      </div>
    </Painel>
  );
}
