// One-shot placeholder icon generator: solid-emerald PNGs at 48/128.
// Re-run to regenerate. Safe to delete once icons exist.
const fs = require("fs")
const path = require("path")
const zlib = require("zlib")

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng(size, [r, g, b]) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
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
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, "icons")
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

for (const size of [48, 128]) {
  fs.writeFileSync(
    path.join(outDir, `icon${size}.png`),
    makePng(size, [16, 185, 129]),
  )
  console.log(`wrote icons/icon${size}.png`)
}
