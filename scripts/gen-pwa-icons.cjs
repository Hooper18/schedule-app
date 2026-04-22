// One-shot placeholder PWA icon generator: solid accent-blue PNGs with a white
// calendar glyph, at 192/512 plus a 180 apple-touch variant. Re-run to refresh.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ACCENT = [0x3b, 0x82, 0xf6] // #3b82f6
const WHITE = [0xff, 0xff, 0xff]

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

// Draw a calendar glyph on a solid-color background.
function drawIcon(size) {
  const pixels = new Array(size * size).fill(ACCENT)

  // Rounded-corner-ish mask: clip 4% corners with background blend (skipped for simplicity).
  // Calendar body
  const pad = Math.round(size * 0.22)
  const left = pad
  const right = size - pad
  const topBar = Math.round(size * 0.32)
  const top = Math.round(size * 0.28)
  const bottom = size - pad

  const stroke = Math.max(2, Math.round(size * 0.035))

  // Outer rect stroke
  for (let x = left; x < right; x++) {
    for (let t = 0; t < stroke; t++) {
      pixels[(top + t) * size + x] = WHITE
      pixels[(bottom - 1 - t) * size + x] = WHITE
    }
  }
  for (let y = top; y < bottom; y++) {
    for (let t = 0; t < stroke; t++) {
      pixels[y * size + (left + t)] = WHITE
      pixels[y * size + (right - 1 - t)] = WHITE
    }
  }

  // Top bar (title strip of calendar)
  for (let y = top; y < topBar; y++) {
    for (let x = left; x < right; x++) pixels[y * size + x] = WHITE
  }

  // Grid dots — 3x2 inside
  const gridTop = topBar + Math.round(size * 0.08)
  const gridH = bottom - gridTop - Math.round(size * 0.06)
  const gridW = right - left - Math.round(size * 0.12)
  const dotR = Math.max(2, Math.round(size * 0.035))
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const cx = left + Math.round(size * 0.06) + Math.round((gx + 0.5) * (gridW / 3))
      const cy = gridTop + Math.round((gy + 0.5) * (gridH / 2))
      for (let dy = -dotR; dy <= dotR; dy++) {
        for (let dx = -dotR; dx <= dotR; dx++) {
          if (dx * dx + dy * dy <= dotR * dotR) {
            const px = cx + dx
            const py = cy + dy
            if (px >= 0 && px < size && py >= 0 && py < size) {
              pixels[py * size + px] = WHITE
            }
          }
        }
      }
    }
  }

  // Serialize to PNG (RGB)
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels[y * size + x]
      row[1 + x * 3] = r
      row[2 + x * 3] = g
      row[3 + x * 3] = b
    }
    rows.push(row)
  }
  const idat = zlib.deflateSync(Buffer.concat(rows))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, '..', 'public')
fs.mkdirSync(outDir, { recursive: true })
for (const [size, name] of [
  [192, 'pwa-192.png'],
  [512, 'pwa-512.png'],
  [180, 'apple-touch-icon.png'],
  [32, 'favicon-32.png'],
]) {
  fs.writeFileSync(path.join(outDir, name), drawIcon(size))
  console.log(`wrote ${name}`)
}
