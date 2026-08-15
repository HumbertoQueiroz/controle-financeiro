import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gera a imagem de compartilhamento (Open Graph) como PNG.
 *
 * PNG e não SVG porque WhatsApp, Facebook e Twitter não renderizam SVG em preview de
 * link — e o WhatsApp é justamente por onde o produto circula, já que é o canal de
 * entrega dos convites. Um `og:image` em SVG aparece como preview quebrado.
 *
 * O PNG é montado à mão com o `zlib` do Node, sem dependência de biblioteca gráfica: o
 * desenho é feito de retângulos, e trazer `sharp` ou `canvas` para o projeto só para isso
 * custaria dezenas de megabytes de dependência nativa.
 *
 * Rode com: pnpm --filter @controle/web og:image
 */

const LARGURA = 1200;
const ALTURA = 630;

type Cor = [number, number, number];

const FUNDO: Cor = [0x09, 0x09, 0x0b];
const DESTAQUE: Cor = [0x4f, 0x46, 0xe5];
const CLARO: Cor = [0xff, 0xff, 0xff];

const pixels = Buffer.alloc(LARGURA * ALTURA * 3);

function preencher(x0: number, y0: number, largura: number, altura: number, cor: Cor) {
  for (let y = Math.max(0, y0); y < Math.min(ALTURA, y0 + altura); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(LARGURA, x0 + largura); x += 1) {
      const posicao = (y * LARGURA + x) * 3;

      pixels[posicao] = cor[0];
      pixels[posicao + 1] = cor[1];
      pixels[posicao + 2] = cor[2];
    }
  }
}

/** Retângulo com cantos arredondados, por teste de distância nos quatro cantos. */
function preencherArredondado(
  x0: number,
  y0: number,
  largura: number,
  altura: number,
  raio: number,
  cor: Cor,
) {
  for (let y = y0; y < y0 + altura; y += 1) {
    for (let x = x0; x < x0 + largura; x += 1) {
      const dx = Math.max(x0 + raio - x, x - (x0 + largura - 1 - raio), 0);
      const dy = Math.max(y0 + raio - y, y - (y0 + altura - 1 - raio), 0);

      if (dx * dx + dy * dy > raio * raio) continue;

      const posicao = (y * LARGURA + x) * 3;

      pixels[posicao] = cor[0];
      pixels[posicao + 1] = cor[1];
      pixels[posicao + 2] = cor[2];
    }
  }
}

preencher(0, 0, LARGURA, ALTURA, FUNDO);

// O mesmo símbolo do favicon, ampliado: duas barras — o que entra e o que sai.
const LADO = 300;
const x = (LARGURA - LADO) / 2;
const y = (ALTURA - LADO) / 2;

preencherArredondado(x, y, LADO, LADO, 66, DESTAQUE);
preencherArredondado(x + 75, y + 141, 47, 94, 14, [0xc7, 0xc4, 0xf5]);
preencherArredondado(x + 178, y + 66, 47, 169, 14, CLARO);

// Faixa inferior de destaque, para a imagem não ficar vazia no rodapé do preview.
preencher(0, ALTURA - 10, LARGURA, 10, DESTAQUE);

const TABELA_CRC = Array.from({ length: 256 }, (_, indice) => {
  let valor = indice;

  for (let bit = 0; bit < 8; bit += 1) {
    valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
  }

  return valor >>> 0;
});

function crc32(dados: Buffer): number {
  let valor = 0xffffffff;

  for (const byte of dados) {
    valor = TABELA_CRC[(valor ^ byte) & 0xff]! ^ (valor >>> 8);
  }

  return (valor ^ 0xffffffff) >>> 0;
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);

  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));

  return Buffer.concat([tamanho, corpo, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(LARGURA, 0);
ihdr.writeUInt32BE(ALTURA, 4);
ihdr[8] = 8; // bits por canal
ihdr[9] = 2; // cor verdadeira (RGB)

// Cada linha do PNG começa com um byte de filtro; 0 = sem filtro.
const linhas: Buffer[] = [];

for (let linha = 0; linha < ALTURA; linha += 1) {
  linhas.push(Buffer.from([0]));
  linhas.push(pixels.subarray(linha * LARGURA * 3, (linha + 1) * LARGURA * 3));
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloco('IHDR', ihdr),
  bloco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
  bloco('IEND', Buffer.alloc(0)),
]);

const destino = resolve(dirname(fileURLToPath(import.meta.url)), '../public/og-image.png');

writeFileSync(destino, png);
console.warn(`og-image.png gerado: ${LARGURA}x${ALTURA}, ${(png.length / 1024).toFixed(1)} kB`);
