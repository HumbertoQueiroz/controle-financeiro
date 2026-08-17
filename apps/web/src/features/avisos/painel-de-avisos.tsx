import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, Bell, Check, CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Aviso, Avisos, TipoDeAviso } from '@controle/shared';
import { GRAVIDADE_DO_AVISO } from '@controle/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Painel } from '@/components/ui/painel';
import { Valor } from '@/components/ui/valor';

const ROTULO: Record<TipoDeAviso, string> = {
  ATRASADO: 'Atrasado',
  VENCE_EM_BREVE: 'Vence em breve',
  CONFIRMAR_PAGAMENTO: 'Confirmar',
  LIMITE_ESTOURADO: 'Limite',
  FECHAMENTO_PENDENTE: 'Fechamento',
};

/** Consulta compartilhada entre o sino e o painel, para um pedido só por janela. */
export function useAvisos() {
  return useQuery({
    queryKey: ['avisos'],
    queryFn: () => api.get<Avisos>('/avisos'),
    // Um minuto: os avisos mudam quando alguém dá baixa noutra aba, e recarregar a cada
    // foco da janela deixaria a lista sempre fresca sem pesar.
    staleTime: 60_000,
  });
}

/**
 * O sino, com o contador do que é urgente.
 *
 * A entrega é dentro do app: não há e-mail, push nem fila neste sistema. Quem não abrir o
 * app não é avisado, e o Manual diz isso — prometer aviso que não chega é pior que não
 * prometer.
 */
export function SinoDeAvisos({ aoAbrir }: { aoAbrir: () => void }) {
  const avisos = useAvisos();
  const total = avisos.data?.itens.length ?? 0;
  const urgentes = avisos.data?.urgentes ?? 0;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={total === 0 ? 'Avisos' : `Avisos: ${total}`}
      className="relative flex size-11 items-center justify-center rounded-padrao text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      <Bell size={20} aria-hidden />

      {total > 0 && (
        // Vermelho só quando há algo de gravidade alta. Um contador sempre vermelho vira
        // ruído, e o dia em que a cor importa passa despercebido.
        <span
          aria-hidden
          className={`absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
            urgentes > 0 ? 'bg-negativo text-white' : 'bg-superficie-2 text-texto-suave'
          }`}
        >
          {total > 9 ? '9+' : total}
        </span>
      )}
    </button>
  );
}

export function PainelDeAvisos({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();
  const avisos = useAvisos();
  const [mostrarLidos, setMostrarLidos] = useState(false);

  const invalidar = () => clienteDeQuery.invalidateQueries({ queryKey: ['avisos'] });

  const confirmar = useMutation({
    mutationFn: (corpo: { avisoIds?: string[]; todos?: boolean }) =>
      api.post('/avisos/leitura', corpo),
    onSuccess: invalidar,
  });

  const desfazer = useMutation({
    mutationFn: (avisoId: string) => api.delete(`/avisos/leitura/${encodeURIComponent(avisoId)}`),
    onSuccess: invalidar,
  });

  const ir = (link: string) => {
    aoFechar();
    navegar(link);
  };

  const pendentes = avisos.data?.itens ?? [];
  const lidos = avisos.data?.lidos ?? [];

  return (
    <Painel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Avisos"
      descricao="Calculados agora. Somem sozinhos quando o motivo deixa de existir."
    >
      <div className="flex flex-col gap-3">
        {pendentes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-texto-suave">
            <CheckCircle size={18} aria-hidden className="text-positivo" />
            Nada exigindo atenção.
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variante="secundaria"
                tamanho="pequeno"
                onClick={() => confirmar.mutate({ todos: true })}
                disabled={confirmar.isPending}
              >
                <Check size={16} aria-hidden />
                Confirmar todos
              </Button>
            </div>

            <ul className="flex flex-col gap-1">
              {pendentes.map((aviso) => (
                <LinhaDeAviso
                  key={aviso.id}
                  aviso={aviso}
                  aoAbrir={() => ir(aviso.link)}
                  aoConfirmar={() => confirmar.mutate({ avisoIds: [aviso.id] })}
                />
              ))}
            </ul>
          </>
        )}

        {lidos.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-borda pt-3">
            <button
              type="button"
              onClick={() => setMostrarLidos((atual) => !atual)}
              aria-expanded={mostrarLidos}
              className="flex min-h-11 items-center justify-between gap-2 rounded-padrao px-1 text-sm text-texto-suave transition-colors hover:text-texto"
            >
              <span>
                {lidos.length} aviso{lidos.length === 1 ? '' : 's'} confirmado
                {lidos.length === 1 ? '' : 's'}
              </span>
              <span className="text-xs">{mostrarLidos ? 'ocultar' : 'mostrar'}</span>
            </button>

            {mostrarLidos && (
              <ul className="flex flex-col gap-1">
                {lidos.map((aviso) => (
                  <LinhaDeAviso
                    key={aviso.id}
                    aviso={aviso}
                    aoAbrir={() => ir(aviso.link)}
                    aoDesfazer={() => desfazer.mutate(aviso.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/*
         * Confirmar leitura não é silenciar, e a diferença só aparece semanas depois —
         * quando um aviso confirmado reaparece. Sem a frase, isso pareceria defeito.
         */}
        <p className="text-xs text-texto-suave">
          Confirmar tira o aviso da lista. Se o motivo mudar — um valor diferente, uma nova data —,
          ele volta a aparecer.
        </p>
      </div>
    </Painel>
  );
}

function LinhaDeAviso({
  aviso,
  aoAbrir,
  aoConfirmar,
  aoDesfazer,
}: {
  aviso: Aviso;
  aoAbrir: () => void;
  aoConfirmar?: () => void;
  aoDesfazer?: () => void;
}) {
  const urgente = GRAVIDADE_DO_AVISO[aviso.tipo] === 'alta';

  return (
    <li className={`flex items-center gap-1 ${aviso.lido ? 'opacity-60' : ''}`}>
      {/* O corpo leva à tela que resolve; o botão ao lado apenas confirma. Fundir os dois
          faria "eu vi" e "vou resolver" virarem o mesmo clique — e o aviso sumiria de quem
          só queria olhar do que se tratava. */}
      <button
        type="button"
        onClick={aoAbrir}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-padrao p-2 text-left transition-colors hover:bg-superficie-2"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {/* Rótulo escrito, e não só a cor: quem não distingue vermelho de cinza
                precisa ler o que é. */}
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                urgente ? 'bg-negativo-suave text-negativo' : 'bg-superficie-2 text-texto-suave'
              }`}
            >
              {ROTULO[aviso.tipo]}
            </span>
            <span className="truncate text-sm text-texto">{aviso.titulo}</span>
          </span>

          <span className="truncate text-xs text-texto-suave">{aviso.detalhe}</span>
        </div>

        {aviso.valor && <Valor valor={aviso.valor} />}
      </button>

      {aoConfirmar && (
        <Button
          variante="fantasma"
          tamanho="icone"
          aria-label={`Confirmar leitura de ${aviso.titulo}`}
          onClick={aoConfirmar}
        >
          <Check size={18} aria-hidden />
        </Button>
      )}

      {aoDesfazer && (
        <Button
          variante="fantasma"
          tamanho="icone"
          aria-label={`Desfazer confirmação de ${aviso.titulo}`}
          onClick={aoDesfazer}
        >
          <ArrowCounterClockwise size={18} aria-hidden />
        </Button>
      )}
    </li>
  );
}
