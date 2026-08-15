/// <reference types="vite/client" />

declare module '*.md?raw' {
  const conteudo: string;
  export default conteudo;
}
