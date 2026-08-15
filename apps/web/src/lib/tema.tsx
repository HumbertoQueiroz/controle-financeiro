import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Tema = 'claro' | 'escuro';

const CHAVE = 'controle:tema';

const TemaContext = createContext<{ tema: Tema; alternar: () => void } | null>(null);

function temaInicial(): Tema {
  const salvo = localStorage.getItem(CHAVE);

  if (salvo === 'claro' || salvo === 'escuro') return salvo;

  // Sem escolha registrada, segue a preferência do sistema — a primeira visita já chega
  // no tema que a pessoa usa no resto do aparelho.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function ProvedorDeTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
    localStorage.setItem(CHAVE, tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((atual) => (atual === 'claro' ? 'escuro' : 'claro'));
  }, []);

  return <TemaContext.Provider value={{ tema, alternar }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const contexto = useContext(TemaContext);

  if (!contexto) throw new Error('useTema precisa estar dentro de ProvedorDeTema');

  return contexto;
}
