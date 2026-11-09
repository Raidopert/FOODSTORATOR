// Генерация иконок PWA из SVG (sharp установлен в проекте)
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const svg = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/>
      <stop offset="1" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" rx="${pad ? 0 : 96}" fill="url(#bg)"/>
  <!-- тарелка -->
  <circle cx="256" cy="300" r="130" fill="#fff7ed"/>
  <circle cx="256" cy="300" r="92" fill="#fed7aa"/>
  <circle cx="256" cy="300" r="92" fill="none" stroke="#fb923c" stroke-width="8"/>
  <!-- колпак повара -->
  <g transform="translate(256 118)">
    <path d="M -78 44 C -130 44 -134 -34 -84 -40 C -80 -92 80 -92 84 -40 C 134 -34 130 44 78 44 L 78 84 L -78 84 Z"
          fill="#fff7ed" stroke="#7c2d12" stroke-width="10" stroke-linejoin="round"/>
    <line x1="-78" y1="52" x2="78" y2="52" stroke="#7c2d12" stroke-width="10" stroke-linecap="round"/>
    <line x1="-44" y1="-10" x2="-44" y2="34" stroke="#fdba74" stroke-width="10" stroke-linecap="round"/>
    <line x1="0" y1="-10" x2="0" y2="34" stroke="#fdba74" stroke-width="10" stroke-linecap="round"/>
    <line x1="44" y1="-10" x2="44" y2="34" stroke="#fdba74" stroke-width="10" stroke-linecap="round"/>
  </g>
  <!-- нож и вилка на тарелке -->
  <g stroke="#7c2d12" stroke-width="14" stroke-linecap="round">
    <line x1="150" y1="410" x2="118" y2="442"/>
    <line x1="362" y1="410" x2="394" y2="442"/>
  </g>
</svg>`

const files = [
  { name: 'icon-192.png', size: 192, pad: 0 },
  { name: 'icon-512.png', size: 512, pad: 0 },
  { name: 'maskable-512.png', size: 512, pad: 56 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0 },
]

for (const f of files) {
  const out = join(outDir, f.name)
  await sharp(Buffer.from(svg(f.pad)))
    .resize(f.size, f.size)
    .png()
    .toFile(out)
  console.log('OK', out)
}

// favicon
const fav = join(outDir, 'favicon-32.png')
await sharp(Buffer.from(svg(0))).resize(32, 32).png().toFile(fav)
console.log('OK', fav)
