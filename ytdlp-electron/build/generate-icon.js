/**
 * 生成占位图标 icon.ico 和 icon.png
 * 使用纯 Node.js，无需额外依赖
 * 生成一个 256x256 的蓝色渐变图标
 */
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIZE = 256;

// --- 生成 PNG ---
function createPNG(size) {
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // 每行 filter byte = None
    for (let x = 0; x < size; x++) {
      // 渐变背景：从深蓝到浅蓝
      const r = Math.floor(30 + (x / size) * 40);
      const g = Math.floor(80 + (y / size) * 60);
      const b = Math.floor(180 + (x / size) * 50);

      // 在中心画一个白色圆角方块
      const margin = size * 0.2;
      const innerSize = size - margin * 2;
      const inRect = x >= margin && x < margin + innerSize && y >= margin && y < margin + innerSize;
      const cornerR = size * 0.08;
      let inShape = false;
      if (inRect) {
        const lx = x - margin, ly = y - margin;
        const rx = margin + innerSize - x, ry = margin + innerSize - y;
        const inCornerTL = lx < cornerR && ly < cornerR && Math.hypot(cornerR - lx, cornerR - ly) > cornerR;
        const inCornerTR = rx < cornerR && ly < cornerR && Math.hypot(cornerR - rx, cornerR - ly) > cornerR;
        const inCornerBL = lx < cornerR && ry < cornerR && Math.hypot(cornerR - lx, cornerR - ry) > cornerR;
        const inCornerBR = rx < cornerR && ry < cornerR && Math.hypot(cornerR - rx, cornerR - ry) > cornerR;
        inShape = !(inCornerTL || inCornerTR || inCornerBL || inCornerBR);
      }

      if (inShape) {
        rawData.push(255, 255, 255, 230);
      } else {
        rawData.push(r, g, b, 255);
      }
    }
  }

  const buf = Buffer.from(rawData);
  const compressed = deflateSync(buf);

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 生成 ICO ---
function createICO(pngBuffer) {
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);  // type: 1 = icon
  iconDir.writeUInt16LE(1, 4);  // image count

  const iconDirEntry = Buffer.alloc(16);
  iconDirEntry[0] = SIZE;       // width
  iconDirEntry[1] = SIZE;       // height
  iconDirEntry[2] = 0;
  iconDirEntry[3] = 0;
  iconDirEntry.writeUInt16LE(1, 4);   // color planes
  iconDirEntry.writeUInt16LE(32, 6);  // bits per pixel
  iconDirEntry.writeUInt32LE(pngBuffer.length, 8);  // image data size
  iconDirEntry.writeUInt32LE(22, 12); // offset to image data

  return Buffer.concat([iconDir, iconDirEntry, pngBuffer]);
}

// --- 主流程 ---
const pngBuffer = createPNG(SIZE);
const icoBuffer = createICO(pngBuffer);

writeFileSync(path.join(__dirname, 'icon.png'), pngBuffer);
writeFileSync(path.join(__dirname, 'icon.ico'), icoBuffer);

console.log('✅ 已生成 build/icon.png 和 build/icon.ico');
