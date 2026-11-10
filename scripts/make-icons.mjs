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
      <stop offset="0" stop-color="#16a34a"/>
      <stop offset="1" stop-color="#14532d"/>
    </linearGradient>
    <linearGradient id="candy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f9a8d4"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <clipPath id="rc"><rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" rx="${pad ? 0 : 96}"/></clipPath>
  <g clip-path="url(#rc)">
    <rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" fill="url(#bg)"/>
    <!-- огромный рот -->
    <g transform="translate(256 300)">
      <ellipse cx="0" cy="0" rx="150" ry="130" fill="#e11d48" stroke="#881337" stroke-width="14"/>
      <ellipse cx="0" cy="6" rx="96" ry="100" fill="#5b1113"/>
      <!-- зубы верхние -->
      <g fill="#ffffff" stroke="#cbd5e1" stroke-width="5">
        <rect x="-78" y="-84" width="34" height="42" rx="12"/>
        <rect x="-38" y="-92" width="34" height="46" rx="12"/>
        <rect x="2" y="-92" width="34" height="46" rx="12"/>
        <rect x="42" y="-84" width="34" height="42" rx="12"/>
      </g>
      <!-- язык -->
      <ellipse cx="0" cy="62" rx="70" ry="38" fill="#fb7185"/>
      <!-- глаза -->
      <circle cx="-62" cy="-164" r="26" fill="#ffffff" stroke="#1c1917" stroke-width="8"/>
      <circle cx="62" cy="-164" r="26" fill="#ffffff" stroke="#1c1917" stroke-width="8"/>
      <circle cx="-56" cy="-158" r="11" fill="#1c1917"/>
      <circle cx="68" cy="-158" r="11" fill="#1c1917"/>
      <path d="M -88 -196 L -40 -184" stroke="#1c1917" stroke-width="10" stroke-linecap="round"/>
      <path d="M 88 -196 L 40 -184" stroke="#1c1917" stroke-width="10" stroke-linecap="round"/>
    </g>
    <!-- вредная конфета летит к рту -->
    <g transform="translate(150 120) rotate(-18)">
      <path d="M -34 0 L -58 -18 L -50 0 L -58 18 Z" fill="#fbcfe8" stroke="#9d174d" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 34 0 L 58 -18 L 50 0 L 58 18 Z" fill="#fbcfe8" stroke="#9d174d" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="0" cy="0" r="34" fill="url(#candy)" stroke="#9d174d" stroke-width="6"/>
      <path d="M -18 -6 A 20 20 0 0 1 6 -20" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round"/>
    </g>
    <!-- брокколи-защитник -->
    <g transform="translate(392 120)">
      <rect x="-14" y="18" width="28" height="42" rx="12" fill="#86efac" stroke="#15803d" stroke-width="8"/>
      <circle cx="-22" cy="0" r="26" fill="#22c55e" stroke="#15803d" stroke-width="8"/>
      <circle cx="22" cy="0" r="24" fill="#16a34a" stroke="#15803d" stroke-width="8"/>
      <circle cx="0" cy="-20" r="26" fill="#4ade80" stroke="#15803d" stroke-width="8"/>
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
