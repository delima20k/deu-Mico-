/**
 * generate-icons.js
 *
 * Gera ícones PWA com fundo BRANCO redimensionados usando jimp.
 * O logo é centralizado com padding dentro de um canvas branco.
 *
 * Uso:
 *   node generate-icons.js
 */

const { Jimp, HorizontalAlign, VerticalAlign, BlendMode } = require('jimp');
const path = require('path');
const fs   = require('fs');

const SOURCE = path.join(__dirname, 'public', 'img', 'carta_logo.png');
const DEST   = path.join(__dirname, 'public', 'icons');
const SIZES  = [72, 96, 128, 144, 152, 192, 384, 512];

fs.mkdirSync(DEST, { recursive: true });

async function generateIcons() {
  const logo = await Jimp.read(SOURCE);

  for (const size of SIZES) {
    // Canvas branco opaco
    const canvas = new Jimp({ width: size, height: size, color: 0xFFFFFFFF });

    // Padding de 10% em cada lado
    const padding   = Math.round(size * 0.10);
    const innerSize = size - padding * 2;

    // Clona e redimensiona o logo mantendo proporção dentro do espaço disponível
    const resized = logo.clone().contain({ w: innerSize, h: innerSize });

    // Centraliza o logo no canvas branco
    const x = Math.round((size - resized.width)  / 2);
    const y = Math.round((size - resized.height) / 2);
    canvas.composite(resized, x, y);

    const destFile = path.join(DEST, `icon-${size}.png`);
    await canvas.write(destFile);
    console.log(`✔ icon-${size}.png — fundo branco, ${size}×${size}px`);
  }

  console.log('\n✅ Ícones gerados com fundo branco em public/icons/');
}

generateIcons().catch(err => {
  console.error('Erro ao gerar ícones:', err.message);
  process.exit(1);
});
