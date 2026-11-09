// Генерация иконок PWA из SVG (sharp установлен в проекте)
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const svg = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fb923c"/>
      <stop offset="1" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <clipPath id="rc"><rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" rx="${pad ? 0 : 96}"/></clipPath>
  <g clip-path="url(#rc)">
    <rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" fill="url(#bg)"/>
    <!-- колпак повара -->
    <g transform="translate(256 128)">
      <path d="M -78 44 C -130 44 -134 -34 -84 -40 C -80 -92 80 -92 84 -40 C 134 -34 130 44 78 44 L 78 84 L -78 84 Z"
            fill="#fff7ed" stroke="#7c2d12" stroke-width="10" stroke-linejoin="round"/>
      <line x1="-78" y1="52" x2="78" y2="52" stroke="#7c2d12" stroke-width="10" stroke-linecap="round"/>
      <line x1="-44" y1="-6" x2="-44" y2="32" stroke="#fdba74" stroke-width="9" stroke-linecap="round"/>
      <line x1="0" y1="-6" x2="0" y2="32" stroke="#fdba74" stroke-width="9" stroke-linecap="round"/>
      <line x1="44" y1="-6" x2="44" y2="32" stroke="#fdba74" stroke-width="9" stroke-linecap="round"/>
    </g>
    <!-- тарелка с бургером -->
    <g>
      <ellipse cx="256" cy="296" rx="92" ry="24" fill="#fff7ed" stroke="#e7e5e4" stroke-width="6"/>
      <path d="M 196 276 Q 256 226 316 276 Z" fill="#f59e0b"/>
      <rect x="196" y="272" width="120" height="12" rx="6" fill="#84cc16"/>
      <rect x="204" y="284" width="104" height="14" rx="7" fill="#7c2d12"/>
    </g>
    <!-- конвейерная лента -->
    <rect x="64" y="312" width="384" height="66" rx="33" fill="#3f3f46" stroke="#27272a" stroke-width="8"/>
    <g fill="#6d6862">
      <rect x="104" y="324" width="14" height="42" rx="7"/>
      <rect x="156" y="324" width="14" height="42" rx="7"/>
      <rect x="208" y="324" width="14" height="42" rx="7"/>
      <rect x="260" y="324" width="14" height="42" rx="7"/>
      <rect x="312" y="324" width="14" height="42" rx="7"/>
      <rect x="364" y="324" width="14" height="42" rx="7"/>
      <rect x="416" y="324" width="14" height="42" rx="7"/>
    </g>
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
