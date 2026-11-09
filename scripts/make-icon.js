// Generates src/MintDex/includes/icon.png (256x256, mint green with a white "M") using only Node built-ins.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = 256
const px = Buffer.alloc(S * S * 4)
const set = (x, y, r, g, b) => { const i = (y * S + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255 }

for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, 16, 185, 129)

// Letter M: two posts and a V between them.
const T = 34, top = 56, bot = 200, L = 52, R = 204
for (let y = top; y < bot; y++) {
    for (let x = L; x < L + T; x++) set(x, y, 255, 255, 255)
    for (let x = R - T; x < R; x++) set(x, y, 255, 255, 255)
}
const mid = (L + R) / 2, vBottom = 150
for (let y = top; y < vBottom; y++) {
    const f = (y - top) / (vBottom - top)
    const lx = Math.round(L + f * (mid - L)), rx = Math.round(R - T - f * (R - T - mid))
    for (let x = lx; x < lx + T; x++) set(x, y, 255, 255, 255)
    for (let x = rx; x < rx + T; x++) set(Math.min(S - 1, x), y, 255, 255, 255)
}

const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4) }

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
])
const out = path.join(__dirname, '..', 'src', 'MintDex', 'includes', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('icon written', out, png.length, 'bytes')
