/** ISO-morphic SHA-256 for content addressing. Not a Node crypto wrapper. */
export function sha256Hex(content: string): string {
  const bytes = utf8Bytes(content)
  const padded = padSha256(bytes)
  const hash = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  for (let offset = 0; offset < padded.length; offset += 64) {
    processSha256Block(padded, offset, hash)
  }
  return Array.from(hash, (word) => (word >>> 0).toString(16).padStart(8, '0')).join('')
}

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function utf8Bytes(content: string): Uint8Array {
  const bytes: number[] = []
  for (const char of content) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return Uint8Array.from(bytes)
}

function padSha256(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  return padded
}

function processSha256Block(padded: Uint8Array, offset: number, hash: Int32Array): void {
  const w = new Int32Array(64)
  const view = new DataView(padded.buffer, padded.byteOffset + offset, 64)
  for (let i = 0; i < 16; i += 1) {
    w[i] = view.getInt32(i * 4)
  }
  for (let i = 16; i < 64; i += 1) {
    const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
    const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
    w[i] = w[i - 16]! + s0 + w[i - 7]! + s1
  }
  let a = hash[0]!
  let b = hash[1]!
  let c = hash[2]!
  let d = hash[3]!
  let e = hash[4]!
  let f = hash[5]!
  let g = hash[6]!
  let h = hash[7]!
  for (let i = 0; i < 64; i += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
    const ch = (e & f) ^ (~e & g)
    const temp1 = h + S1 + ch + K[i]! + w[i]!
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
    const maj = (a & b) ^ (a & c) ^ (b & c)
    const temp2 = S0 + maj
    h = g
    g = f
    f = e
    e = (d + temp1) | 0
    d = c
    c = b
    b = a
    a = (temp1 + temp2) | 0
  }
  hash[0] += a
  hash[1] += b
  hash[2] += c
  hash[3] += d
  hash[4] += e
  hash[5] += f
  hash[6] += g
  hash[7] += h
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}
