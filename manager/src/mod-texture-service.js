const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Décodeur PNG 100% pur JS en RGBA (supporte filtres 0..4 et types couleur 0, 2, 3+PLTE+tRNS, 4, 6 — 0 écriture disque)
 */
function decodePngToRgba(pngBuf) {
  if (!pngBuf || pngBuf.length < 33 || pngBuf.subarray(0, 8).compare(PNG_SIG) !== 0) return null;
  let offset = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6, interlace = 0;
  let palette = null;
  let trns = null;
  const idatParts = [];

  while (offset + 12 <= pngBuf.length) {
    const len = pngBuf.readUInt32BE(offset);
    const type = pngBuf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > pngBuf.length) break;
    if (type === 'IHDR' && len >= 13) {
      width = pngBuf.readUInt32BE(dataStart);
      height = pngBuf.readUInt32BE(dataStart + 4);
      bitDepth = pngBuf[dataStart + 8];
      colorType = pngBuf[dataStart + 9];
      interlace = pngBuf[dataStart + 12];
    } else if (type === 'PLTE') {
      palette = pngBuf.subarray(dataStart, dataEnd);
    } else if (type === 'tRNS') {
      trns = pngBuf.subarray(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      idatParts.push(pngBuf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || ![1, 2, 4, 8].includes(bitDepth) || interlace !== 0 || idatParts.length === 0) return null;

  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idatParts));
  } catch (_) {
    return null;
  }

  const channels = colorType === 6 ? 4 : (colorType === 4 ? 2 : (colorType === 2 ? 3 : 1));
  const rowBytes = bitDepth < 8 ? Math.ceil((width * channels * bitDepth) / 8) : width * channels;
  const stride = 1 + rowBytes;
  if (inflated.length < height * stride) return null;

  const filterStep = bitDepth < 8 ? 1 : channels;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * stride];
    const srcOff = y * stride + 1;
    const dstOff = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const val = inflated[srcOff + x];
      const a = x >= filterStep ? raw[dstOff + x - filterStep] : 0;
      const b = y > 0 ? raw[dstOff - rowBytes + x] : 0;
      const c = (x >= filterStep && y > 0) ? raw[dstOff - rowBytes + x - filterStep] : 0;
      let recon = val;
      if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paethPredictor(a, b, c)) & 0xff;
      raw[dstOff + x] = recon;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  const trnsGray = (colorType === 0 && trns && trns.length >= 2) ? trns.readUInt16BE(0) : -1;
  const trnsR = (colorType === 2 && trns && trns.length >= 6) ? trns.readUInt16BE(0) : -1;
  const trnsG = (colorType === 2 && trns && trns.length >= 6) ? trns.readUInt16BE(2) : -1;
  const trnsB = (colorType === 2 && trns && trns.length >= 6) ? trns.readUInt16BE(4) : -1;

  const readSubByte = (y, x) => {
    const bitPos = x * bitDepth;
    const byte = raw[y * rowBytes + (bitPos >> 3)];
    const shift = 8 - bitDepth - (bitPos & 7);
    return (byte >> shift) & ((1 << bitDepth) - 1);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const di = i * 4;
      if (colorType === 6) {
        const si = i * 4;
        rgba[di] = raw[si]; rgba[di + 1] = raw[si + 1]; rgba[di + 2] = raw[si + 2]; rgba[di + 3] = raw[si + 3];
      } else if (colorType === 2) {
        const si = i * 3;
        const r = raw[si], g = raw[si + 1], b = raw[si + 2];
        rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b;
        rgba[di + 3] = (r === trnsR && g === trnsG && b === trnsB) ? 0 : 255;
      } else if (colorType === 4) {
        const si = i * 2;
        const g = raw[si];
        rgba[di] = g; rgba[di + 1] = g; rgba[di + 2] = g; rgba[di + 3] = raw[si + 1];
      } else if (colorType === 0) {
        const gVal = bitDepth < 8 ? Math.round((readSubByte(y, x) * 255) / ((1 << bitDepth) - 1)) : raw[i];
        rgba[di] = gVal; rgba[di + 1] = gVal; rgba[di + 2] = gVal;
        rgba[di + 3] = (gVal === trnsGray) ? 0 : 255;
      } else if (colorType === 3 && palette) {
        const idx = bitDepth < 8 ? readSubByte(y, x) : raw[i];
        rgba[di] = palette[idx * 3] || 0;
        rgba[di + 1] = palette[idx * 3 + 1] || 0;
        rgba[di + 2] = palette[idx * 3 + 2] || 0;
        rgba[di + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
      }
    }
  }

  return { width, height, rgba };
}

function encodeRgbaToPng(width, height, rgba) {
  const makeChunk = (type, data) => {
    const lBuf = Buffer.alloc(4);
    lBuf.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cBuf = Buffer.alloc(4);
    cBuf.writeUInt32BE(pngCrc32(td), 0);
    return Buffer.concat([lBuf, td, cBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawScanlines[y * (1 + width * 4)] = 0;
    rgba.copy(rawScanlines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(rawScanlines)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function cropPngToSquareIcon(pngBuf, rx, ry, rw, rh, outSize = null) {
  const decoded = decodePngToRgba(pngBuf);
  if (!decoded) return null;
  const { width, height, rgba } = decoded;
  if (rx + rw > width || ry + rh > height) return null;
  const size = outSize || Math.max(rw, rh);
  const out = Buffer.alloc(size * size * 4);
  const offX = Math.floor((size - rw) / 2);
  const offY = Math.floor((size - rh) / 2);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const si = ((ry + y) * width + (rx + x)) * 4;
      const di = ((offY + y) * size + (offX + x)) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return encodeRgbaToPng(size, size, out);
}

/**
 * Si un item/bloc est une bande animée verticale Minecraft (ex: 16x96, 16x512, 32x64), extrait proprement la frame 0 (carrée).
 */
function normalizeItemIconPng(pngBuf) {
  if (!pngBuf || pngBuf.length < 24) return pngBuf;
  const w = pngBuf.readUInt32BE(16);
  const h = pngBuf.readUInt32BE(20);
  if (w > 0 && h > w && (h % w === 0)) {
    const frame0 = cropPngToSquareIcon(pngBuf, 0, 0, w, w, w);
    if (frame0) return frame0;
  }
  return pngBuf;
}

function blitRect(src, sx, sy, sw, sh, dst, dw, dx, dy) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (sx + x >= src.width || sy + y >= src.height) continue;
      if (dx + x < 0 || dx + x >= dw || dy + y < 0 || dy + y >= dw) continue;
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const a = src.rgba[si + 3];
      if (a === 0) continue;
      const di = ((dy + y) * dw + (dx + x)) * 4;
      dst[di] = src.rgba[si];
      dst[di + 1] = src.rgba[si + 1];
      dst[di + 2] = src.rgba[si + 2];
      dst[di + 3] = a;
    }
  }
}

function buildBedIconFromEntity(bedPngBuf) {
  const dec = decodePngToRgba(bedPngBuf);
  if (!dec || dec.width < 64 || dec.height < 64) return null;
  // Silhouette classique de lit Minecraft (vue de côté + dessus, 24x24) depuis entity/bed/<color>.png (64x64)
  // Dans entity/bed/<color>.png : oreiller/tête dessus=(6,6,16,16), couverture dessus=(6,28,16,16), côté tête=(0,6,6,16), côté pied=(0,28,6,16)
  const size = 24;
  const out = Buffer.alloc(size * size * 4);
  const putPx = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const di = (y * size + x) * 4;
    out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
  };
  const sample = (sx, sy) => {
    const cx = Math.max(0, Math.min(dec.width - 1, sx));
    const cy = Math.max(0, Math.min(dec.height - 1, sy));
    const si = (cy * dec.width + cx) * 4;
    return [dec.rgba[si], dec.rgba[si + 1], dec.rgba[si + 2], dec.rgba[si + 3]];
  };

  // Dessiner le lit de profil (largeur 20 px de x=2..21, hauteur y=7..18)
  // 1. Oreiller blanc (x=3..8, y=7..10) échantillonné depuis la zone oreiller (6..20, 6..12)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      const [r, g, b] = sample(8 + x * 2, 7 + y);
      putPx(3 + x, 7 + y, r, g, b, 255);
    }
  }
  // 2. Matelas / couverture colorée (x=2..21, y=10..14) échantillonnée depuis la couverture (6..21, 28..43)
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 20; x++) {
      const sx = x < 6 ? (8 + x * 2) : (6 + ((x - 6) % 15));
      const sy = x < 6 ? (11 + y) : (29 + y * 2);
      const [r, g, b] = sample(sx, sy);
      // Légère ombre sur les 2 rangées basses pour le relief 3D
      const shade = y >= 3 ? 0.82 : 1.0;
      putPx(2 + x, 10 + y, Math.round(r * shade), Math.round(g * shade), Math.round(b * shade), 255);
    }
  }
  // 3. Cadre en bois + pieds (x=2..21, y=15..16 + pieds x=2..4 et x=19..21, y=17..19)
  const wood = [160, 128, 82];
  const woodDark = [115, 88, 52];
  for (let x = 2; x <= 21; x++) {
    putPx(x, 15, ...wood);
    putPx(x, 16, ...woodDark);
  }
  for (let y = 17; y <= 19; y++) {
    for (const lx of [2, 3, 4, 19, 20, 21]) {
      putPx(lx, y, ...(lx === 4 || lx === 21 ? woodDark : wood));
    }
  }
  return encodeRgbaToPng(size, size, out);
}

function buildChestIconFromEntity(chestPngBuf) {
  const dec = decodePngToRgba(chestPngBuf);
  if (!dec || dec.width < 64 || dec.height < 64) return null;
  const size = 16;
  const out = Buffer.alloc(size * size * 4);
  // Face avant couvercle (14, 14, 14, 5) + face avant base (14, 33, 14, 10) + serrure (1, 1, 2, 4)
  blitRect(dec, 14, 14, 14, 5, out, size, 1, 1);
  blitRect(dec, 14, 33, 14, 10, out, size, 1, 5);
  blitRect(dec, 1, 1, 2, 4, out, size, 7, 4);
  return encodeRgbaToPng(size, size, out);
}

const VANILLA_BANNER_COLORS = {
  white: [249, 255, 254], orange: [249, 128, 29], magenta: [199, 78, 189], light_blue: [58, 179, 218],
  yellow: [254, 216, 61], lime: [128, 199, 31], pink: [243, 139, 170], gray: [71, 79, 82],
  light_gray: [157, 157, 151], cyan: [22, 156, 156], purple: [137, 50, 184], blue: [60, 68, 170],
  brown: [131, 84, 50], green: [94, 124, 22], red: [176, 46, 38], black: [29, 29, 33]
};

function buildBannerIcon(colorName) {
  const rgb = VANILLA_BANNER_COLORS[colorName];
  if (!rgb) return null;
  const size = 16;
  const out = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b) => {
    const di = (y * size + x) * 4;
    out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
  };
  // Poteau en bois
  for (let y = 1; y <= 14; y++) { put(7, y, 138, 104, 62); put(8, y, 112, 82, 47); }
  for (let x = 4; x <= 11; x++) { put(x, 1, 158, 122, 74); put(x, 2, 125, 93, 53); }
  // Tissu coloré
  for (let y = 3; y <= 12; y++) {
    const shade = y === 3 ? 1.05 : (y >= 11 ? 0.85 : 1.0);
    for (let x = 4; x <= 11; x++) {
      const edge = (x === 4 || x === 11) ? 0.9 : 1.0;
      put(x, y, Math.min(255, Math.round(rgb[0] * shade * edge)), Math.min(255, Math.round(rgb[1] * shade * edge)), Math.min(255, Math.round(rgb[2] * shade * edge)));
    }
  }
  return encodeRgbaToPng(size, size, out);
}

const VANILLA_MOB_HEAD_ENTITIES = {
  creeper_head: { paths: ['assets/minecraft/textures/entity/creeper/creeper.png'], crop: [8, 8, 8, 8] },
  zombie_head: { paths: ['assets/minecraft/textures/entity/zombie/zombie.png'], crop: [8, 8, 8, 8] },
  skeleton_skull: { paths: ['assets/minecraft/textures/entity/skeleton/skeleton.png'], crop: [8, 8, 8, 8] },
  wither_skeleton_skull: { paths: ['assets/minecraft/textures/entity/skeleton/wither_skeleton.png'], crop: [8, 8, 8, 8] },
  piglin_head: { paths: ['assets/minecraft/textures/entity/piglin/piglin.png'], crop: [8, 8, 10, 8] },
  dragon_head: { paths: ['assets/minecraft/textures/entity/enderdragon/dragon.png'], crop: [128, 46, 16, 16] }
};

/**
 * Lecteur ZIP/JAR 100% pur Node.js (zéro dépendance, zéro sous-processus, 100% identique Windows & macOS).
 * Lit le Central Directory une seule fois par JAR (indexé par mtimeMs) puis extrait n'importe quelle entrée en mémoire.
 */
function readZipDirectory(jarPath) {
  let fd = null;
  try {
    const stat = fs.statSync(jarPath);
    const fileSize = stat.size;
    if (fileSize < 22) return null;

    fd = fs.openSync(jarPath, 'r');

    // Localiser End Of Central Directory (EOCD : signature 0x06054b50)
    const searchLen = Math.min(fileSize, 65557);
    const tailBuf = Buffer.alloc(searchLen);
    fs.readSync(fd, tailBuf, 0, searchLen, fileSize - searchLen);

    let eocdOffset = -1;
    for (let i = searchLen - 22; i >= 0; i--) {
      if (
        tailBuf[i] === 0x50 &&
        tailBuf[i + 1] === 0x4b &&
        tailBuf[i + 2] === 0x05 &&
        tailBuf[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return null;

    const cdSize = tailBuf.readUInt32LE(eocdOffset + 12);
    const cdOffset = tailBuf.readUInt32LE(eocdOffset + 16);
    if (cdOffset + cdSize > fileSize) return null;

    const cdBuf = Buffer.alloc(cdSize);
    fs.readSync(fd, cdBuf, 0, cdSize, cdOffset);

    const entries = new Map();
    const namespaces = new Set();
    let ptr = 0;

    while (ptr + 46 <= cdBuf.length) {
      if (cdBuf.readUInt32LE(ptr) !== 0x02014b50) break;
      const method = cdBuf.readUInt16LE(ptr + 10);
      const compSize = cdBuf.readUInt32LE(ptr + 20);
      const uncompSize = cdBuf.readUInt32LE(ptr + 24);
      const nameLen = cdBuf.readUInt16LE(ptr + 28);
      const extraLen = cdBuf.readUInt16LE(ptr + 30);
      const commentLen = cdBuf.readUInt16LE(ptr + 32);
      const localHeaderOffset = cdBuf.readUInt32LE(ptr + 42);

      const entryName = cdBuf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
      ptr += 46 + nameLen + extraLen + commentLen;

      if (!entryName || entryName.endsWith('/')) continue;
      entries.set(entryName, { method, compSize, uncompSize, localHeaderOffset });

      if (entryName.startsWith('assets/')) {
        const slashIdx = entryName.indexOf('/', 7);
        if (slashIdx > 7) {
          namespaces.add(entryName.slice(7, slashIdx).toLowerCase());
        }
      }
    }

    return { mtimeMs: stat.mtimeMs, size: fileSize, entries, namespaces };
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

function readZipEntryFromBuffer(zipBuf, targetName = null) {
  if (!zipBuf || zipBuf.length < 22) return null;
  const fileSize = zipBuf.length;
  const searchLen = Math.min(fileSize, 65557);
  let eocdOffset = -1;
  for (let i = fileSize - 22; i >= fileSize - searchLen; i--) {
    if (
      zipBuf[i] === 0x50 &&
      zipBuf[i + 1] === 0x4b &&
      zipBuf[i + 2] === 0x05 &&
      zipBuf[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const cdSize = zipBuf.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  if (cdOffset + cdSize > fileSize) return null;

  const entries = new Map();
  const namespaces = new Set();
  let ptr = cdOffset;
  const end = cdOffset + cdSize;

  while (ptr + 46 <= end) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(ptr + 10);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(ptr + 42);
    const entryName = zipBuf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!entryName || entryName.endsWith('/')) continue;
    const meta = { method, compSize, uncompSize, localHeaderOffset };
    entries.set(entryName, meta);
    if (entryName.startsWith('assets/')) {
      const slashIdx = entryName.indexOf('/', 7);
      if (slashIdx > 7) namespaces.add(entryName.slice(7, slashIdx).toLowerCase());
    }
    if (targetName && entryName === targetName) {
      return extractEntryFromBuffer(zipBuf, meta);
    }
  }

  return targetName ? null : { entries, namespaces, buffer: zipBuf };
}

function extractEntryFromBuffer(zipBuf, meta) {
  if (!meta) return null;
  const lh = meta.localHeaderOffset;
  if (lh + 30 > zipBuf.length) return null;
  if (zipBuf.readUInt32LE(lh) !== 0x04034b50) return null;
  const nameLen = zipBuf.readUInt16LE(lh + 26);
  const extraLen = zipBuf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLen + extraLen;
  const dataEnd = dataStart + meta.compSize;
  if (dataEnd > zipBuf.length) return null;

  const raw = zipBuf.subarray(dataStart, dataEnd);
  if (meta.method === 0) return Buffer.from(raw);
  if (meta.method === 8) return zlib.inflateRawSync(raw);
  return null;
}

function extractZipEntry(jarPath, meta) {
  if (!meta) return null;
  let fd = null;
  try {
    fd = fs.openSync(jarPath, 'r');
    const lhBuf = Buffer.alloc(30);
    fs.readSync(fd, lhBuf, 0, 30, meta.localHeaderOffset);
    if (lhBuf.readUInt32LE(0) !== 0x04034b50) return null;
    const nameLen = lhBuf.readUInt16LE(26);
    const extraLen = lhBuf.readUInt16LE(28);
    const dataOffset = meta.localHeaderOffset + 30 + nameLen + extraLen;

    const compBuf = Buffer.alloc(meta.compSize);
    fs.readSync(fd, compBuf, 0, meta.compSize, dataOffset);

    if (meta.method === 0) return compBuf;
    if (meta.method === 8) return zlib.inflateRawSync(compBuf);
    return null;
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

function isPngBuffer(buf) {
  return Boolean(
    buf &&
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

class ModTextureService {
  constructor() {
    // Cache purement en mémoire (AUCUN stockage disque de textures extraites)
    this.memoryCache = new Map();
    this.maxMemoryCacheEntries = 600;

    // Index des JARs en mémoire: jarPath -> { mtimeMs, size, entries: Map, namespaces: Set }
    this.jarIndexCache = new Map();

    // Index par monde: worldPath -> { signature, nsMap: Map<ns, Set<jarPath>>, nestedCache: Map }
    this.worldIndexCache = new Map();

    // Référence optionnelle vers minecraftService (injectée via setMinecraftService ou à l'appel)
    this.minecraftService = null;

    // Découverte multiplateforme des JARs client Vanilla locaux (macOS, Windows, Linux)
    this.vanillaJars = this.discoverVanillaJars();
  }

  setMinecraftService(mcService) {
    this.minecraftService = mcService;
  }

  setMemoryCache(key, value) {
    if (this.memoryCache.size >= this.maxMemoryCacheEntries) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, value);
  }

  /**
   * Résout le vrai dossier d'un monde (compatible macOS bundlé, Windows %APPDATA%, GAMES_DIR et dev)
   */
  resolveWorldPath(worldId, minecraftService = null) {
    if (!worldId) return null;
    if (path.isAbsolute(worldId) && fs.existsSync(worldId)) return worldId;

    const mc = minecraftService || this.minecraftService;
    const isWin = process.platform === 'win32';
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

    const candidateBases = [
      mc && mc.gamesDir ? mc.gamesDir : null,
      process.env.GAMES_DIR ? path.resolve(process.env.GAMES_DIR) : null,
      isWin
        ? path.join(appData, 'Cubirium', 'games')
        : path.join(os.homedir(), 'Library', 'Application Support', 'Cubirium', 'games'),
      isWin
        ? path.join(appData, 'MinecraftServerManager', 'games')
        : path.join(os.homedir(), 'Library', 'Application Support', 'MinecraftServerManager', 'games'),
      path.resolve(__dirname, '..', '..', 'games')
    ].filter(Boolean);

    for (const base of candidateBases) {
      const candidate = path.join(base, worldId);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Découvre les JARs Minecraft client Vanilla installés sur la machine (macOS + Windows + Linux)
   */
  discoverVanillaJars() {
    const home = os.homedir();
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    const candidateVersionDirs = [];
    if (isMac) {
      candidateVersionDirs.push(
        path.join(home, 'Library', 'Application Support', 'minecraft', 'versions'),
        path.join(home, 'Library', 'Application Support', 'ModrinthApp', 'meta', 'versions'),
        path.join(home, 'Documents', 'curseforge', 'minecraft', 'Install', 'versions')
      );
    } else if (isWin) {
      candidateVersionDirs.push(
        path.join(appData, '.minecraft', 'versions'),
        path.join(appData, 'ModrinthApp', 'meta', 'versions'),
        path.join(home, 'curseforge', 'minecraft', 'Install', 'versions')
      );
    } else {
      candidateVersionDirs.push(
        path.join(home, '.minecraft', 'versions'),
        path.join(home, '.local', 'share', 'ModrinthApp', 'meta', 'versions')
      );
    }

    const jars = [];
    const seen = new Set();

    for (const versionsDir of candidateVersionDirs) {
      if (!fs.existsSync(versionsDir)) continue;
      try {
        const dirs = fs.readdirSync(versionsDir);
        for (const d of dirs) {
          const lower = d.toLowerCase();
          if (lower.includes('forge') || lower.includes('fabric-loader') || lower.includes('optifine') || lower.includes('quilt')) {
            continue;
          }
          const jar = path.join(versionsDir, d, `${d}.jar`);
          if (fs.existsSync(jar) && !seen.has(jar)) {
            seen.add(jar);
            jars.push(jar);
          }
        }
      } catch (_) {}
    }

    // Prioriser les versions les plus récentes (26.x, 1.21.11, 1.21.4, 1.21.1, etc.)
    const scoreVersion = (jarPath) => {
      const name = path.basename(jarPath, '.jar');
      const m26 = name.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
      if (!m26) return 0;
      const maj = parseInt(m26[1], 10);
      const min = parseInt(m26[2], 10);
      const pat = parseInt(m26[3] || '0', 10);
      const isSnapshot = /pre|rc|w|snapshot/i.test(name) ? -1 : 0;
      return maj * 1000000 + min * 1000 + pat * 10 + isSnapshot;
    };

    jars.sort((a, b) => scoreVersion(b) - scoreVersion(a));
    return jars;
  }

  getJarIndex(jarPath) {
    if (!jarPath || !fs.existsSync(jarPath)) return null;
    try {
      const stat = fs.statSync(jarPath);
      const cached = this.jarIndexCache.get(jarPath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached;
      }
      const index = readZipDirectory(jarPath);
      if (index) {
        this.jarIndexCache.set(jarPath, index);
      }
      return index;
    } catch (_) {
      return null;
    }
  }

  readJarBuffer(jarPath, entryPath) {
    const index = this.getJarIndex(jarPath);
    if (!index) return null;
    const meta = index.entries.get(entryPath);
    if (!meta) return null;
    return extractZipEntry(jarPath, meta);
  }

  getJarEntries(jarPath, namespace = null) {
    const index = this.getJarIndex(jarPath);
    if (!index) return new Set();
    if (!namespace) return new Set(index.entries.keys());
    const prefix = `assets/${namespace}/`;
    const filtered = new Set();
    for (const key of index.entries.keys()) {
      if (key.startsWith(prefix)) filtered.add(key);
    }
    return filtered;
  }

  /**
   * Indexe directement tous les JARs présents dans le dossier mods/ (et resourcepacks/) du monde demandé.
   * S'invalide automatiquement si un mod est ajouté, retiré ou modifié.
   */
  getWorldModIndex(worldId, minecraftService = null) {
    const worldPath = this.resolveWorldPath(worldId, minecraftService);
    if (!worldPath) return { worldPath: null, nsMap: new Map(), allJars: [] };

    const candidateDirs = [
      path.join(worldPath, 'mods'),
      path.join(worldPath, 'resourcepacks')
    ];

    const jarPaths = [];
    const sigParts = [];
    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.jar') || f.endsWith('.zip')).sort();
        for (const f of files) {
          const full = path.join(dir, f);
          try {
            const st = fs.statSync(full);
            if (st.isFile()) {
              jarPaths.push(full);
              sigParts.push(`${f}:${st.mtimeMs}:${st.size}`);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    const signature = sigParts.join('|');
    const cached = this.worldIndexCache.get(worldPath);
    if (cached && cached.signature === signature) {
      return cached;
    }

    const nsMap = new Map(); // namespace -> Set<jarPath>
    for (const jp of jarPaths) {
      const idx = this.getJarIndex(jp);
      if (!idx) continue;
      for (const ns of idx.namespaces) {
        if (!nsMap.has(ns)) nsMap.set(ns, new Set());
        nsMap.get(ns).add(jp);
      }
    }

    const result = { worldPath, signature, nsMap, allJars: jarPaths };
    this.worldIndexCache.set(worldPath, result);
    // Invalider le cache mémoire des items de ce monde si la liste de mods a changé
    if (cached && cached.signature !== signature) {
      for (const key of Array.from(this.memoryCache.keys())) {
        if (key.includes(`${worldId}:`)) this.memoryCache.delete(key);
      }
    }
    return result;
  }

  /**
   * Retourne les JARs du monde contenant ce namespace (directs + heuristique nom de fichier + jar-in-jar)
   */
  getJarsForNamespace(worldId, namespace, minecraftService = null) {
    const worldIdx = this.getWorldModIndex(worldId, minecraftService);
    const jars = [];

    if (worldIdx.nsMap.has(namespace)) {
      jars.push(...Array.from(worldIdx.nsMap.get(namespace)));
    }

    // Recherche souple par nom de fichier dans le même monde
    if (jars.length === 0 && worldIdx.allJars.length > 0) {
      const cleanNs = namespace.replace(/_v\d+$/, '').replace(/_/g, '');
      for (const jp of worldIdx.allJars) {
        const base = path.basename(jp).toLowerCase().replace(/\.(jar|zip)$/, '').replace(/[-_]/g, '');
        if (cleanNs && (base.includes(cleanNs) || cleanNs.includes(base))) {
          jars.push(jp);
        }
      }
    }

    return Array.from(new Set(jars));
  }

  /**
   * Cherche également dans les JARs imbriqués (META-INF/jarjar/*.jar ou META-INF/jars/*.jar)
   * utilisés par Fabric, Forge et NeoForge pour les mods bibliothèques
   */
  findNestedJarForNamespace(worldId, namespace, minecraftService = null) {
    const worldIdx = this.getWorldModIndex(worldId, minecraftService);
    for (const jp of worldIdx.allJars) {
      const idx = this.getJarIndex(jp);
      if (!idx) continue;
      for (const [entryName, meta] of idx.entries.entries()) {
        if (
          (entryName.startsWith('META-INF/jarjar/') || entryName.startsWith('META-INF/jars/')) &&
          entryName.endsWith('.jar')
        ) {
          try {
            const nestedBuf = extractZipEntry(jp, meta);
            const parsed = readZipEntryFromBuffer(nestedBuf);
            if (parsed && parsed.namespaces.has(namespace)) {
              return parsed;
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  /**
   * Résout la référence de texture depuis un modèle JSON (supporte 1.21.4+ items/*.json et chaînes parent)
   */
  resolveTextureFromModel(readFn, hasFn, namespace, startModelRef, depth = 0) {
    if (depth > 6 || !startModelRef) return null;
    const [mNs, mPathRaw] = startModelRef.includes(':') ? startModelRef.split(':') : [namespace, startModelRef];
    const mPath = mPathRaw.replace(/^models\//, '').replace(/\.json$/, '');
    const modelFile = `assets/${mNs}/models/${mPath}.json`;
    if (!hasFn(modelFile)) return null;

    try {
      const rawBuf = readFn(modelFile);
      if (!rawBuf) return null;
      const json = JSON.parse(rawBuf.toString('utf8'));
      const texturesObj = json.textures || {};

      const priorityKeys = ['layer0', 'layer1', 'front', 'north', 'top', 'texture', 'all', 'side', 'wall', 'end', 'particle'];
      const resolveRef = (ref, guard = 0) => {
        if (!ref || typeof ref !== 'string' || guard > 5) return null;
        if (ref.startsWith('#')) {
          const targetKey = ref.slice(1);
          return resolveRef(texturesObj[targetKey], guard + 1);
        }
        return ref;
      };

      for (const k of priorityKeys) {
        const val = resolveRef(texturesObj[k]);
        if (val) return { ref: val, fallbackNs: mNs };
      }
      for (const v of Object.values(texturesObj)) {
        const val = resolveRef(v);
        if (val) return { ref: val, fallbackNs: mNs };
      }

      if (json.parent && !json.parent.startsWith('builtin/')) {
        return this.resolveTextureFromModel(readFn, hasFn, mNs, json.parent, depth + 1);
      }
    } catch (_) {}
    return null;
  }

  /**
   * Résout un fichier d'item moderne 1.21.4+ / 26.x (assets/<ns>/items/<name>.json)
   */
  resolveModernItemDefinition(readFn, hasFn, namespace, name) {
    const defPath = `assets/${namespace}/items/${name}.json`;
    if (!hasFn(defPath)) return null;
    try {
      const buf = readFn(defPath);
      if (!buf) return null;
      const json = JSON.parse(buf.toString('utf8'));

      const extractModelRef = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 8) return null;
        if (typeof node.model === 'string') return node.model;
        if (node.model && typeof node.model === 'object') {
          const r = extractModelRef(node.model, depth + 1);
          if (r) return r;
        }
        if (node.fallback) {
          const r = extractModelRef(node.fallback, depth + 1);
          if (r) return r;
        }
        if (node.on_false) {
          const r = extractModelRef(node.on_false, depth + 1);
          if (r) return r;
        }
        if (node.on_true) {
          const r = extractModelRef(node.on_true, depth + 1);
          if (r) return r;
        }
        if (Array.isArray(node.cases) && node.cases.length > 0) {
          for (const c of node.cases) {
            const r = extractModelRef(c.model || c, depth + 1);
            if (r) return r;
          }
        }
        if (Array.isArray(node.models)) {
          for (const sub of node.models) {
            const r = extractModelRef(sub, depth + 1);
            if (r) return r;
          }
        }
        if (Array.isArray(node.entries)) {
          for (const sub of node.entries) {
            const r = extractModelRef(sub.model || sub, depth + 1);
            if (r) return r;
          }
        }
        return null;
      };

      const modelRef = extractModelRef(json);
      if (modelRef) {
        return this.resolveTextureFromModel(readFn, hasFn, namespace, modelRef);
      }
    } catch (_) {}
    return null;
  }

  /**
   * Extrait une texture depuis un lecteur générique (JAR disque ou JAR imbriqué en mémoire)
   */
  extractItemFromArchive(readFn, hasFn, allEntryKeys, namespace, name, worldId, minecraftService) {
    const nameVariants = Array.from(new Set([
      name,
      name.replace(/_of_the_/g, 'ofthe_'),
      name.replace(/_of_/g, 'of_'),
      name.replace(/_the_/g, 'the_'),
      name.replace(/_/g, '')
    ]));

    // 1. Chemins directs item / block / gui / entity
    for (const variant of nameVariants) {
      const candidates = [
        `assets/${namespace}/textures/item/${variant}.png`,
        `assets/${namespace}/textures/items/${variant}.png`,
        `assets/${namespace}/textures/block/${variant}.png`,
        `assets/${namespace}/textures/blocks/${variant}.png`,
        `assets/${namespace}/textures/block/${variant}_front.png`,
        `assets/${namespace}/textures/block/${variant}_top.png`,
        `assets/${namespace}/textures/block/${variant}_side.png`,
        `assets/${namespace}/textures/block/${variant}_side_0.png`,
        `assets/${namespace}/textures/block/${variant}_end.png`,
        `assets/${namespace}/textures/${variant}.png`,
        `assets/${namespace}/textures/gui/${variant}.png`
      ];
      for (const cand of candidates) {
        if (hasFn(cand)) {
          const buf = readFn(cand);
          if (isPngBuffer(buf)) return buf;
        }
      }
    }

    // 2. Définitions d'items modernes 1.21.4+ (assets/<ns>/items/<name>.json) & modèles classiques
    for (const variant of nameVariants) {
      const resolved =
        this.resolveModernItemDefinition(readFn, hasFn, namespace, variant) ||
        this.resolveTextureFromModel(readFn, hasFn, namespace, `${namespace}:item/${variant}`) ||
        this.resolveTextureFromModel(readFn, hasFn, namespace, `${namespace}:block/${variant}`);

      if (resolved && resolved.ref) {
        const [texNs, texPathRaw] = resolved.ref.includes(':')
          ? resolved.ref.split(':')
          : [resolved.fallbackNs || namespace, resolved.ref];
        const cleanTex = texPathRaw.replace(/^textures\//, '').replace(/\.png$/, '');

        if (texNs === 'minecraft' && namespace !== 'minecraft') {
          const vBuf = this.getVanillaTexture(cleanTex.replace(/^(item|block)\//, ''), 160, 101, 64, worldId, minecraftService);
          if (vBuf) return vBuf;
        }

        const texCandidates = [
          `assets/${texNs}/textures/${cleanTex}.png`,
          `assets/${texNs}/textures/item/${cleanTex}.png`,
          `assets/${texNs}/textures/block/${cleanTex}.png`
        ];
        for (const tc of texCandidates) {
          if (hasFn(tc)) {
            const buf = readFn(tc);
            if (isPngBuffer(buf)) return buf;
          }
        }
      }
    }

    // 3. Recherche heuristique par mots-clés (uniquement pour les mods, évite faux positifs vanilla)
    if (namespace !== 'minecraft') {
      const keywords = name.toLowerCase().split('_').filter(w => w.length >= 3 && !['item', 'armor', 'the', 'and'].includes(w));
      if (keywords.length > 0) {
        const prefix = `assets/${namespace}/textures/`;
        for (const entry of allEntryKeys) {
          if (!entry.startsWith(prefix) || !entry.endsWith('.png')) continue;
          if (!entry.includes('/item/') && !entry.includes('/items/') && !entry.includes('/block/') && !entry.includes('/blocks/')) continue;
          const entryLower = entry.toLowerCase();
          const matchesCount = keywords.filter(k => entryLower.includes(k)).length;
          if (matchesCount >= Math.min(2, keywords.length)) {
            const buf = readFn(entry);
            if (isPngBuffer(buf)) return buf;
          }
        }
      }
    }

    return null;
  }

  /**
   * Récupère la texture PNG d'un item directement depuis les mods du monde ou les JARs Minecraft (0 stockage disque)
   */
  getTexture(worldId, itemId, color = null, minecraftService = null) {
    if (!itemId) return null;
    const cleanId = String(itemId).trim().toLowerCase();
    const parts = cleanId.split(':');
    const namespace = parts.length > 1 ? parts[0] : 'minecraft';
    const name = parts.length > 1 ? parts[1] : parts[0];

    // S'assurer que l'index du monde est à jour (détecte ajout/suppression de mods)
    if (worldId) {
      this.getWorldModIndex(worldId, minecraftService);
    }

    const cacheKey = `item:${worldId || 'default'}:${cleanId}${color ? ':' + color : ''}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    // 1. Si c'est un item de mod, lire DIRECTEMENT dans les mods du monde
    if (namespace !== 'minecraft') {
      const modBuf = this.getModTexture(worldId, namespace, name, minecraftService);
      if (modBuf) {
        const finalBuf = normalizeItemIconPng(modBuf);
        this.setMemoryCache(cacheKey, finalBuf);
        return finalBuf;
      }
      return null;
    }

    // 2. Item Vanilla (minecraft:) : vérifier d'abord un éventuel resourcepack/override dans le monde, puis les JARs Vanilla locaux
    let r = 160, g = 101, b = 64;
    if (color !== null && color !== undefined && color !== '') {
      const num = parseInt(color, 10);
      if (!isNaN(num)) {
        r = (num >> 16) & 0xff;
        g = (num >> 8) & 0xff;
        b = num & 0xff;
      }
    }
    const vanillaBuf = this.getVanillaTexture(name, r, g, b, worldId, minecraftService);
    if (vanillaBuf) {
      const finalBuf = normalizeItemIconPng(vanillaBuf);
      this.setMemoryCache(cacheKey, finalBuf);
      return finalBuf;
    }

    return null;
  }

  getVanillaTexture(name, r = 160, g = 101, b = 64, worldId = null, minecraftService = null) {
    // Cas spécial 1 : armure en cuir teintée (calculée à la volée en mémoire, jamais écrite sur disque)
    if (name.startsWith('leather_') && (name.includes('helmet') || name.includes('chestplate') || name.includes('leggings') || name.includes('boots') || name.includes('horse_armor'))) {
      const tinted = this.generateTintedLeatherArmor(name, r, g, b);
      if (tinted) return tinted;
    }

    if (this.vanillaJars.length === 0) {
      this.vanillaJars = this.discoverVanillaJars();
    }

    // Cas spécial 2 : Bouclier Vanilla (extrait la vraie face avant bois + bordure fer depuis shield_base_nopattern)
    if (name === 'shield') {
      const shieldPaths = [
        'assets/minecraft/textures/entity/shield/shield_base_nopattern.png',
        'assets/minecraft/textures/entity/shield_base_nopattern.png',
        'assets/minecraft/textures/entity/shield/shield_base.png',
        'assets/minecraft/textures/entity/shield_base.png',
        'assets/minecraft/textures/entity/shield/base.png'
      ];
      for (const sp of shieldPaths) {
        for (const jar of this.vanillaJars) {
          const buf = this.readJarBuffer(jar, sp);
          if (isPngBuffer(buf)) {
            const cropped = cropPngToSquareIcon(buf, 1, 1, 12, 22, 24);
            if (cropped) return cropped;
          }
        }
      }
    }

    // Cas spécial 3 : Lits Vanilla (16 couleurs — silhouette complète du lit au lieu du fragment latéral 26.x)
    if (name.endsWith('_bed')) {
      const bedColor = name.slice(0, -4);
      for (const jar of this.vanillaJars) {
        const buf = this.readJarBuffer(jar, `assets/minecraft/textures/entity/bed/${bedColor}.png`);
        if (isPngBuffer(buf)) {
          const icon = buildBedIconFromEntity(buf);
          if (icon) return icon;
        }
      }
    }

    // Cas spécial 4 : Coffres Vanilla (face avant complète avec serrure au lieu de planches)
    if (name === 'chest' || name === 'trapped_chest' || name === 'ender_chest') {
      const chestFile = name === 'ender_chest' ? 'ender.png' : (name === 'trapped_chest' ? 'trapped.png' : 'normal.png');
      for (const jar of this.vanillaJars) {
        const buf = this.readJarBuffer(jar, `assets/minecraft/textures/entity/chest/${chestFile}`);
        if (isPngBuffer(buf)) {
          const icon = buildChestIconFromEntity(buf);
          if (icon) return icon;
        }
      }
    }

    // Cas spécial 5 : Boîtes de Shulker Vanilla
    if (name === 'shulker_box' || name.endsWith('_shulker_box')) {
      const shulkerFile = name === 'shulker_box' ? 'shulker.png' : `shulker_${name.slice(0, -12)}.png`;
      for (const jar of this.vanillaJars) {
        const buf = this.readJarBuffer(jar, `assets/minecraft/textures/entity/shulker/${shulkerFile}`);
        if (isPngBuffer(buf)) {
          const cropped = cropPngToSquareIcon(buf, 16, 16, 16, 16, 16);
          if (cropped) return cropped;
        }
      }
    }

    // Cas spécial 6 : Bannières Vanilla (16 couleurs)
    if (name.endsWith('_banner')) {
      const bColor = name.slice(0, -7);
      const bannerIcon = buildBannerIcon(bColor);
      if (bannerIcon) return bannerIcon;
    }

    // Cas spécial 7 : Tête de joueur (visage Steve par défaut au lieu de soul_sand)
    if (name === 'player_head') {
      const stevePath = path.join(__dirname, '..', 'public', 'assets', 'minecraft', 'skin', 'steve.png');
      if (fs.existsSync(stevePath)) {
        try {
          const cropped = cropPngToSquareIcon(fs.readFileSync(stevePath), 8, 8, 8, 8, 8);
          if (cropped) return cropped;
        } catch (_) {}
      }
    }

    // Cas spécial 8 : Têtes de monstres Vanilla (extrait le vrai visage depuis la texture d'entité au lieu du particle soul_sand)
    const mobHeadSpec = VANILLA_MOB_HEAD_ENTITIES[name];
    if (mobHeadSpec) {
      for (const jar of this.vanillaJars) {
        for (const ep of mobHeadSpec.paths) {
          const buf = this.readJarBuffer(jar, ep);
          if (isPngBuffer(buf)) {
            const [rx, ry, rw, rh] = mobHeadSpec.crop;
            const cropped = cropPngToSquareIcon(buf, rx, ry, rw, rh);
            if (cropped) return cropped;
          }
        }
      }
    }

    // Chercher d'abord dans les resourcepacks/mods du monde si un override existe
    if (worldId) {
      const worldJars = this.getJarsForNamespace(worldId, 'minecraft', minecraftService);
      for (const jar of worldJars) {
        const idx = this.getJarIndex(jar);
        if (!idx) continue;
        const buf = this.extractItemFromArchive(
          (e) => extractZipEntry(jar, idx.entries.get(e)),
          (e) => idx.entries.has(e),
          idx.entries.keys(),
          'minecraft',
          name,
          worldId,
          minecraftService
        );
        if (buf) return buf;
      }
    }

    // Puis dans les JARs client Minecraft installés sur la machine
    for (const jar of this.vanillaJars) {
      const idx = this.getJarIndex(jar);
      if (!idx) continue;
      const buf = this.extractItemFromArchive(
        (e) => extractZipEntry(jar, idx.entries.get(e)),
        (e) => idx.entries.has(e),
        idx.entries.keys(),
        'minecraft',
        name,
        worldId,
        minecraftService
      );
      if (buf) return buf;
    }

    return null;
  }

  getModTexture(worldId, namespace, name, minecraftService = null) {
    const targetJars = this.getJarsForNamespace(worldId, namespace, minecraftService);
    for (const jarPath of targetJars) {
      const idx = this.getJarIndex(jarPath);
      if (!idx) continue;
      const buf = this.extractItemFromArchive(
        (e) => extractZipEntry(jarPath, idx.entries.get(e)),
        (e) => idx.entries.has(e),
        idx.entries.keys(),
        namespace,
        name,
        worldId,
        minecraftService
      );
      if (buf) return buf;
    }

    // Repli : JAR imbriqué (META-INF/jarjar/*.jar ou META-INF/jars/*.jar) dans le dossier mods du monde
    const nested = this.findNestedJarForNamespace(worldId, namespace, minecraftService);
    if (nested) {
      const buf = this.extractItemFromArchive(
        (e) => extractEntryFromBuffer(nested.buffer, nested.entries.get(e)),
        (e) => nested.entries.has(e),
        nested.entries.keys(),
        namespace,
        name,
        worldId,
        minecraftService
      );
      if (buf) return buf;
    }

    return null;
  }

  /**
   * Extrait la texture d'une face spécifique d'un bloc/tête portable sur le skin 3D (ex: citrouille sculptée, TNT, blocs moddés)
   */
  getBlockFaceTexture(worldId, itemId, face = 'front', minecraftService = null) {
    if (!itemId) return null;
    const cleanId = String(itemId).trim().toLowerCase();
    const parts = cleanId.split(':');
    const namespace = parts.length > 1 ? parts[0] : 'minecraft';
    const name = parts.length > 1 ? parts[1] : parts[0];

    const cacheKey = `face:${worldId || 'default'}:${cleanId}:${face}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    const faceMap = {
      front: [`${name}_front`, `${name}`, `${name}_side`],
      side: [`${name}_side`, `${name}`, `${name}_front`],
      top: [`${name}_top`, `${name}_end`, `${name}`],
      bottom: [`${name}_bottom`, `${name}_top`, `${name}_end`, `${name}`]
    };

    // Cas particuliers Vanilla (ex: carved_pumpkin utilise pumpkin_side & pumpkin_top)
    if (namespace === 'minecraft' && (name === 'carved_pumpkin' || name === 'jack_o_lantern')) {
      faceMap.front = [name];
      faceMap.side = ['pumpkin_side'];
      faceMap.top = ['pumpkin_top'];
      faceMap.bottom = ['pumpkin_top'];
    }

    const searchJars = namespace === 'minecraft'
      ? [...this.getJarsForNamespace(worldId, 'minecraft', minecraftService), ...this.vanillaJars]
      : this.getJarsForNamespace(worldId, namespace, minecraftService);

    const namesToTry = faceMap[face] || [name];

    for (const jarPath of searchJars) {
      const idx = this.getJarIndex(jarPath);
      if (!idx) continue;
      for (const candName of namesToTry) {
        const candidates = [
          `assets/${namespace}/textures/block/${candName}.png`,
          `assets/${namespace}/textures/blocks/${candName}.png`,
          `assets/${namespace}/textures/item/${candName}.png`
        ];
        for (const c of candidates) {
          if (idx.entries.has(c)) {
            const buf = extractZipEntry(jarPath, idx.entries.get(c));
            if (isPngBuffer(buf)) {
              this.setMemoryCache(cacheKey, buf);
              return buf;
            }
          }
        }
      }
    }

    // Repli sur la texture d'item standard
    const fallback = this.getTexture(worldId, itemId, null, minecraftService);
    if (fallback) {
      this.setMemoryCache(cacheKey, fallback);
      return fallback;
    }
    return null;
  }

  /**
   * Extrait la texture d'équipement 3D portée sur le skin (armures vanilla & moddées 1.12 -> 26.x, élytres, etc.)
   * Retourne { buffer, kind: 'armor' | 'elytra' } ou Buffer via getArmorTexture()
   */
  getArmorTexture(worldId, itemId, layer = 1, color = null, equippableAssetId = null, minecraftService = null) {
    if (!itemId) return null;
    const cleanId = String(itemId).trim().toLowerCase();
    const parts = cleanId.split(':');
    const namespace = parts.length > 1 ? parts[0] : 'minecraft';
    const name = parts.length > 1 ? parts[1] : parts[0];

    if (worldId) {
      this.getWorldModIndex(worldId, minecraftService);
    }

    const cacheKey = `armor:${worldId || 'default'}:${cleanId}:l${layer}:${equippableAssetId || ''}:${color || ''}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    // 0. Élytres / ailes (Vanilla ou moddées)
    if (name === 'elytra' || name.includes('elytra') || name.includes('wings')) {
      const searchJars = namespace === 'minecraft'
        ? [...this.getJarsForNamespace(worldId, 'minecraft', minecraftService), ...this.vanillaJars]
        : this.getJarsForNamespace(worldId, namespace, minecraftService);

      for (const jarPath of searchJars) {
        const idx = this.getJarIndex(jarPath);
        if (!idx) continue;
        const wingCandidates = [
          `assets/${namespace}/textures/entity/equipment/wings/${name}.png`,
          `assets/${namespace}/textures/entity/equipment/wings/elytra.png`,
          `assets/${namespace}/textures/entity/${name}.png`,
          `assets/${namespace}/textures/entity/elytra.png`
        ];
        for (const wc of wingCandidates) {
          if (idx.entries.has(wc)) {
            const buf = extractZipEntry(jarPath, idx.entries.get(wc));
            if (isPngBuffer(buf)) {
              this.setMemoryCache(cacheKey, buf);
              return buf;
            }
          }
        }
      }
    }

    // 0b. Boucliers 3D (Vanilla ou moddés — priorité à shield_base_nopattern avec bois + bordure fer)
    if (name === 'shield' || name.endsWith('_shield')) {
      const searchJars = namespace === 'minecraft'
        ? [...this.getJarsForNamespace(worldId, 'minecraft', minecraftService), ...this.vanillaJars]
        : this.getJarsForNamespace(worldId, namespace, minecraftService);

      const shieldCandidates = [
        `assets/${namespace}/textures/entity/shield/shield_base_nopattern.png`,
        `assets/${namespace}/textures/entity/shield_base_nopattern.png`,
        `assets/${namespace}/textures/entity/shield/shield_base.png`,
        `assets/${namespace}/textures/entity/shield_base.png`,
        `assets/${namespace}/textures/entity/${name}.png`,
        `assets/${namespace}/textures/entity/shield/${name}.png`,
        `assets/${namespace}/textures/entity/shield/base.png`
      ];

      for (const sc of shieldCandidates) {
        for (const jarPath of searchJars) {
          const idx = this.getJarIndex(jarPath);
          if (!idx) continue;
          if (idx.entries.has(sc)) {
            const buf = extractZipEntry(jarPath, idx.entries.get(sc));
            if (isPngBuffer(buf)) {
              this.setMemoryCache(cacheKey, buf);
              return buf;
            }
          }
        }
      }
    }

    // 0c. Têtes de monstres Vanilla (pour le rendu 3D sur la tête du skin)
    if (namespace === 'minecraft' && VANILLA_MOB_HEAD_ENTITIES[name]) {
      const searchJars = [...this.getJarsForNamespace(worldId, 'minecraft', minecraftService), ...this.vanillaJars];
      for (const jarPath of searchJars) {
        const idx = this.getJarIndex(jarPath);
        if (!idx) continue;
        for (const ep of VANILLA_MOB_HEAD_ENTITIES[name].paths) {
          if (idx.entries.has(ep)) {
            const buf = extractZipEntry(jarPath, idx.entries.get(ep));
            if (isPngBuffer(buf)) {
              this.setMemoryCache(cacheKey, buf);
              return buf;
            }
          }
        }
      }
    }

    // 1. Support du composant moderne 1.21.2+ / 26.x `minecraft:equippable` (asset_id -> assets/<ns>/equipment/<id>.json)
    if (equippableAssetId) {
      const [eqNs, eqName] = equippableAssetId.includes(':')
        ? equippableAssetId.toLowerCase().split(':')
        : [namespace, equippableAssetId.toLowerCase()];
      const eqJars = eqNs === 'minecraft'
        ? [...this.getJarsForNamespace(worldId, 'minecraft', minecraftService), ...this.vanillaJars]
        : this.getJarsForNamespace(worldId, eqNs, minecraftService);

      const buf = this.extractModernEquipmentFromJars(eqJars, eqNs, eqName, layer);
      if (buf) {
        this.setMemoryCache(cacheKey, buf);
        return buf;
      }
    }

    // 2. Armures Vanilla (extraction depuis les JARs Minecraft locaux en priorité, puis assets embarqués)
    const vanillaMaterials = ['leather', 'iron', 'gold', 'golden', 'diamond', 'netherite', 'chainmail', 'turtle', 'copper'];
    const detectedRaw = vanillaMaterials.find(m => name.startsWith(m + '_') || name === m);
    const detectedMat = detectedRaw === 'golden' ? 'gold' : detectedRaw;

    if (namespace === 'minecraft' && detectedMat) {
      // Chercher dans les JARs Vanilla locaux (supporte 1.21.2+ humanoid/humanoid_leggings & copper + classic models/armor)
      const modernMatName = detectedMat === 'turtle' ? 'turtle_scute' : detectedMat;
      const fromJar = this.extractModernEquipmentFromJars(this.vanillaJars, 'minecraft', modernMatName, layer) ||
                      this.extractClassicArmorFromJars(this.vanillaJars, 'minecraft', detectedMat, layer);
      if (fromJar) {
        this.setMemoryCache(cacheKey, fromJar);
        return fromJar;
      }

      // Repli sur les assets Vanilla embarqués dans Cubirium (fonctionne même sans client MC installé localement)
      const localArmorPng = path.join(__dirname, '..', 'public', 'assets', 'minecraft', 'armor', `${detectedMat}_layer_${layer}.png`);
      if (fs.existsSync(localArmorPng)) {
        try {
          const buf = fs.readFileSync(localArmorPng);
          if (isPngBuffer(buf)) {
            this.setMemoryCache(cacheKey, buf);
            return buf;
          }
        } catch (_) {}
      }
    }

    // 3. Armures de mods (directement depuis games/<worldId>/mods/*.jar — formats 1.21.2+ equipment ET classiques models/armor)
    if (namespace !== 'minecraft') {
      const targetJars = this.getJarsForNamespace(worldId, namespace, minecraftService);
      const baseMat = name.replace(/_(helmet|chestplate|leggings|boots|armor|plate|cap|tunic|pants|greaves|hood|mask|crown|robe|mantle)$/g, '');

      // 3a. Tentative directe format 1.21.2+ equipment & classic models/armor par nom de matériau
      if (targetJars.length > 0 && baseMat) {
        const directBuf =
          this.extractModernEquipmentFromJars(targetJars, namespace, baseMat, layer) ||
          this.extractClassicArmorFromJars(targetJars, namespace, baseMat, layer);
        if (directBuf) {
          this.setMemoryCache(cacheKey, directBuf);
          return directBuf;
        }
      }

      // 3b. Recherche intelligente scorée dans les JARs du mod (MCreator, GeckoLib, Curios, armures aux noms custom)
      const scoredBuf = this.searchModArmorInJars(targetJars, namespace, name, layer);
      if (scoredBuf) {
        this.setMemoryCache(cacheKey, scoredBuf);
        return scoredBuf;
      }

      // 3c. Tentative dans les JARs imbriqués (jarjar)
      const nested = this.findNestedJarForNamespace(worldId, namespace, minecraftService);
      if (nested) {
        const nestedBuf = this.searchModArmorInArchive(
          (e) => extractEntryFromBuffer(nested.buffer, nested.entries.get(e)),
          (e) => nested.entries.has(e),
          Array.from(nested.entries.keys()),
          namespace,
          name,
          layer
        );
        if (nestedBuf) {
          this.setMemoryCache(cacheKey, nestedBuf);
          return nestedBuf;
        }
      }
    }

    return null;
  }

  extractModernEquipmentFromJars(jars, namespace, matName, layer) {
    const folder = layer === 2 ? 'humanoid_leggings' : 'humanoid';
    const eqJsonPath = `assets/${namespace}/equipment/${matName}.json`;
    const directTexPath = `assets/${namespace}/textures/entity/equipment/${folder}/${matName}.png`;

    for (const jarPath of jars) {
      const idx = this.getJarIndex(jarPath);
      if (!idx) continue;

      if (idx.entries.has(eqJsonPath)) {
        try {
          const json = JSON.parse(extractZipEntry(jarPath, idx.entries.get(eqJsonPath)).toString('utf8'));
          const layerArr = json && json.layers && json.layers[folder];
          if (Array.isArray(layerArr) && layerArr.length > 0 && layerArr[0].texture) {
            const ref = String(layerArr[0].texture);
            const [tNs, tPath] = ref.includes(':') ? ref.split(':') : [namespace, ref];
            const texPath = `assets/${tNs}/textures/entity/equipment/${folder}/${tPath}.png`;
            if (idx.entries.has(texPath)) {
              const buf = extractZipEntry(jarPath, idx.entries.get(texPath));
              if (isPngBuffer(buf)) return buf;
            }
          }
        } catch (_) {}
      }

      if (idx.entries.has(directTexPath)) {
        const buf = extractZipEntry(jarPath, idx.entries.get(directTexPath));
        if (isPngBuffer(buf)) return buf;
      }
    }
    return null;
  }

  extractClassicArmorFromJars(jars, namespace, matName, layer) {
    const candidates = [
      `assets/${namespace}/textures/models/armor/${matName}_layer_${layer}.png`,
      `assets/${namespace}/textures/models/armor/${matName}_layer${layer}.png`,
      `assets/${namespace}/textures/armor/${matName}_layer_${layer}.png`,
      `assets/${namespace}/textures/entity/armor/${matName}_layer_${layer}.png`
    ];
    for (const jarPath of jars) {
      const idx = this.getJarIndex(jarPath);
      if (!idx) continue;
      for (const c of candidates) {
        if (idx.entries.has(c)) {
          const buf = extractZipEntry(jarPath, idx.entries.get(c));
          if (isPngBuffer(buf)) return buf;
        }
      }
    }
    return null;
  }

  searchModArmorInJars(jars, namespace, name, layer) {
    for (const jarPath of jars) {
      const idx = this.getJarIndex(jarPath);
      if (!idx) continue;
      const buf = this.searchModArmorInArchive(
        (e) => extractZipEntry(jarPath, idx.entries.get(e)),
        (e) => idx.entries.has(e),
        Array.from(idx.entries.keys()),
        namespace,
        name,
        layer
      );
      if (buf) return buf;
    }
    return null;
  }

  searchModArmorInArchive(readFn, hasFn, entryKeys, namespace, name, layer) {
    let pieceType = 'chestplate';
    if (layer === 2 || name.endsWith('_leggings') || name.endsWith('_pants') || name.includes('leggings') || name.includes('pants')) {
      pieceType = 'leggings';
    } else if (name.endsWith('_boots') || name.endsWith('_boot') || name.includes('boots') || name.includes('boot')) {
      pieceType = 'boots';
    } else if (name.endsWith('_helmet') || name.includes('helmet') || name.includes('mask') || name.includes('hood') || name.includes('crown') || name.includes('hat')) {
      pieceType = 'helmet';
    }

    const conflicts = {
      helmet: ['chestplate', 'breastplate', 'boot', 'boots', 'leggings', 'pants'],
      chestplate: ['helmet', 'mask', 'cap', 'crown', 'boot', 'boots', 'leggings', 'pants'],
      leggings: ['helmet', 'mask', 'chestplate', 'breastplate', 'boot', 'boots'],
      boots: ['helmet', 'mask', 'chestplate', 'breastplate', 'leggings', 'pants']
    }[pieceType] || [];

    const primaryPieceTerms = {
      helmet: ['helmet', 'mask', 'masc', 'hood', 'head', 'crown', 'hat'],
      chestplate: ['chestplate', 'breastplate', 'chest', 'robe', 'mantle', 'tunic'],
      leggings: ['leggings', 'pants', 'greaves'],
      boots: ['boots', 'boot', 'shoes']
    }[pieceType] || [];

    const itemTokens = name.replace(/_(helmet|chestplate|leggings|boots|armor|plate|hat|crown|hood|mask)$/g, '').split('_');
    const modelPath = `assets/${namespace}/models/item/${name}.json`;
    if (hasFn(modelPath)) {
      try {
        const json = JSON.parse((readFn(modelPath) || '').toString('utf8'));
        if (json && json.textures) {
          for (const k of Object.keys(json.textures)) {
            const val = String(json.textures[k]).split(':').pop().split('/').pop();
            itemTokens.push(...val.split('_'));
            itemTokens.push(val);
          }
        }
      } catch (_) {}
    }

    const uniqueTokens = Array.from(new Set(itemTokens.map(t => t.toLowerCase()).filter(t => t.length >= 3 && !['ofthe', 'item', 'armor'].includes(t))));
    const prefix = `assets/${namespace}/`;

    const candidates = [];
    for (const e of entryKeys) {
      if (!e.startsWith(prefix) || !e.endsWith('.png')) continue;
      const lower = e.toLowerCase();
      if (lower.includes('/textures/item/') || lower.includes('/textures/items/') || lower.includes('/textures/block/') || lower.includes('/textures/blocks/') || lower.includes('/textures/gui/')) {
        continue;
      }
      const filename = lower.split('/').pop().replace(/\.png$/, '');
      if (conflicts.some(c => filename.includes(c))) continue;

      const isArmorFolder = lower.includes('/armor/') || lower.includes('/models/armor/') || lower.includes('/equipment/humanoid');
      const matchesAnyPiece = primaryPieceTerms.some(term => filename.includes(term) || lower.includes(term)) || lower.includes('layer_') || lower.includes('layer');
      if (!isArmorFolder && !matchesAnyPiece) continue;

      if (layer === 1 && (lower.includes('layer_2') || lower.includes('layer2') || lower.includes('humanoid_leggings'))) continue;
      if (layer === 2 && (lower.includes('layer_1') || lower.includes('layer1') || (lower.includes('/humanoid/') && !lower.includes('leggings')))) continue;

      candidates.push(e);
    }

    const scored = candidates.map(cand => {
      const lower = cand.toLowerCase();
      const filename = lower.split('/').pop().replace(/\.png$/, '');
      let tokenMatches = 0;
      for (const t of uniqueTokens) {
        if (filename.includes(t)) tokenMatches += 4;
        else if (lower.includes(t)) tokenMatches += 2;
        else if (t.length >= 4 && filename.includes(t.slice(0, 4))) tokenMatches += 1;
      }
      const hasLayer = lower.includes('layer_' + layer) || lower.includes('layer' + layer) ||
        (layer === 2 && lower.includes('humanoid_leggings')) || (layer === 1 && lower.includes('/humanoid/'));
      const isArmorFolder = lower.includes('/armor/') || lower.includes('/models/armor/') || lower.includes('/equipment/');
      const matchesPrimary = primaryPieceTerms.some(term => filename.includes(term));

      let score = tokenMatches * 10;
      if (matchesPrimary) score += 50;
      if (hasLayer && tokenMatches > 0) score += 30;
      if (isArmorFolder && tokenMatches > 0) score += 20;

      return { cand, score };
    }).filter(x => x.score > 0);

    scored.sort((a, b) => b.score - a.score);

    for (const item of scored) {
      const buf = readFn(item.cand);
      if (isPngBuffer(buf)) return buf;
    }

    return null;
  }

  /**
   * Génère dynamiquement en mémoire une texture d'armure en cuir teintée avec son overlay (0 écriture disque)
   */
  generateTintedLeatherArmor(itemName, r = 160, g = 101, b = 64) {
    for (const jar of this.vanillaJars) {
      try {
        const baseBuf = this.readJarBuffer(jar, `assets/minecraft/textures/item/${itemName}.png`);
        const baseDec = decodePngToRgba(baseBuf);
        if (!baseDec) continue;

        const { width, height, rgba } = baseDec;
        const outRgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          const alpha = rgba[idx + 3];
          if (alpha > 0) {
            outRgba[idx] = Math.round((rgba[idx] * r) / 255);
            outRgba[idx + 1] = Math.round((rgba[idx + 1] * g) / 255);
            outRgba[idx + 2] = Math.round((rgba[idx + 2] * b) / 255);
            outRgba[idx + 3] = alpha;
          }
        }

        // Superposer l'overlay (boucles, lacets)
        const overlayBuf = this.readJarBuffer(jar, `assets/minecraft/textures/item/${itemName}_overlay.png`);
        const ovDec = decodePngToRgba(overlayBuf);
        if (ovDec && ovDec.width === width && ovDec.height === height) {
          const ov = ovDec.rgba;
          for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            const oa = ov[idx + 3];
            if (oa === 255) {
              outRgba[idx] = ov[idx];
              outRgba[idx + 1] = ov[idx + 1];
              outRgba[idx + 2] = ov[idx + 2];
              outRgba[idx + 3] = 255;
            } else if (oa > 0) {
              const ba = outRgba[idx + 3];
              const resA = oa + Math.round((ba * (255 - oa)) / 255);
              outRgba[idx] = Math.round((ov[idx] * oa + outRgba[idx] * ba * (255 - oa) / 255) / (resA || 1));
              outRgba[idx + 1] = Math.round((ov[idx + 1] * oa + outRgba[idx + 1] * ba * (255 - oa) / 255) / (resA || 1));
              outRgba[idx + 2] = Math.round((ov[idx + 2] * oa + outRgba[idx + 2] * ba * (255 - oa) / 255) / (resA || 1));
              outRgba[idx + 3] = resA;
            }
          }
        }

        return encodeRgbaToPng(width, height, outRgba);
      } catch (_) {}
    }
    return null;
  }
}

module.exports = new ModTextureService();
