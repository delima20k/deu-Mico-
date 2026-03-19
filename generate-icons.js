/**
 * generate-icons.js
 *
 * Gera ícones placeholder para o PWA copiando `/public/img/carta_logo.png`
 * para cada tamanho necessário em `/public/icons/`.
 *
 * As imagens NÃO são redimensionadas (requer `sharp` para isso).
 * Para gerar ícones com tamanhos corretos, instale sharp e use:
 *   npm install sharp
 *   # depois descomente o bloco "com sharp" abaixo
 *
 * Uso:
 *   node generate-icons.js
 */

const fs   = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'public', 'img', 'carta_logo.png');
const DEST   = path.join(__dirname, 'public', 'icons');
const SIZES  = [72, 96, 128, 144, 152, 192, 384, 512];

// ── Verificações ────────────────────────────────────────────────────────────
if (!fs.existsSync(SOURCE)) {
  console.error('[!] Arquivo de origem não encontrado:', SOURCE);
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

// ── Opção A: cópia simples (sem redimensionamento) ─────────────────────────
// Útil para ter os arquivos presentes e passarem na validação do PWABuilder.
// Para a Play Store, substitua por ícones redimensionados corretamente.

SIZES.forEach((size) => {
  const destFile = path.join(DEST, `icon-${size}.png`);
  fs.copyFileSync(SOURCE, destFile);
  console.log(`✔ Criado: public/icons/icon-${size}.png (cópia placeholder — ${size}×${size})`);
});

console.log('\n✅ Ícones placeholder gerados em public/icons/');
console.log('⚠  Os ícones são cópias de carta_logo.png (não redimensionadas).');
console.log('   Para ícones com tamanhos corretos, use:');
console.log('   → https://www.pwabuilder.com/imageGenerator');
console.log('   → npm install sharp  (e depois use o bloco comentado abaixo)\n');

// ── Opção B: redimensionamento real com sharp (descomente se disponível) ───
/*
const sharp = require('sharp');

Promise.all(
  SIZES.map((size) =>
    sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 18, g: 18, b: 18, alpha: 1 } })
      .png()
      .toFile(path.join(DEST, `icon-${size}.png`))
      .then(() => console.log(`✔ icon-${size}.png gerado com sharp`))
  )
).then(() => console.log('\n✅ Todos os ícones redimensionados com sharp.'));
*/
