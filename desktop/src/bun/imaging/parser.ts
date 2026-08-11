// code credit - https://github.com/image-size/image-size
const decoder = new TextDecoder();
export const toUTF8String = (input: Uint8Array, start = 0, end = input.length) => decoder.decode(input.slice(start, end));
export const toHexString = (input: Uint8Array, start = 0, end = input.length) => input.slice(start, end).reduce((memo, i) => memo + `0${i.toString(16)}`.slice(-2), '');
const getView = (input: Uint8Array, offset: number) => new DataView(input.buffer, input.byteOffset + offset);
export const readInt16LE = (input: Uint8Array, offset = 0) => getView(input, offset).getInt16(0, true);
export const readUInt16BE = (input: Uint8Array, offset = 0) => getView(input, offset).getUint16(0, false);
export const readUInt16LE = (input: Uint8Array, offset = 0) => getView(input, offset).getUint16(0, true);
export const readUInt24LE = (input: Uint8Array, offset = 0) => { const view = getView(input, offset); return view.getUint16(0, true) + (view.getUint8(2) << 16); };
export const readInt32LE = (input: Uint8Array, offset = 0) => getView(input, offset).getInt32(0, true);
export const readUInt32BE = (input: Uint8Array, offset = 0) => getView(input, offset).getUint32(0, false);
export const readUInt32LE = (input: Uint8Array, offset = 0) => getView(input, offset).getUint32(0, true);
export function readUInt(input: Uint8Array, bits: 16 | 32, offset = 0, isBigEndian = false): number { return isBigEndian ? (bits === 16 ? readUInt16BE(input, offset) : readUInt32BE(input, offset)) : (bits === 16 ? readUInt16LE(input, offset) : readUInt32LE(input, offset)); }

class ImageParser {
  parse(buf: Uint8Array, mime: string): { w: number; h: number } | null {
    try {
      switch (mime) {
        case 'image/gif': return this.parseGif(buf)
        case 'image/png': return this.parsePng(buf)
        case 'image/jpeg': return this.parseJpeg(buf)
        case 'image/bmp': return this.parseBmp(buf)
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon': return this.parseIco(buf)
        case 'image/webp': return this.parseWebp(buf)
        default: return null
      }
    } catch {
      return null
    }
  }

  private parseGif(buf: Uint8Array): { w: number; h: number } {
    if (!/^GIF8[79]a/.test(toUTF8String(buf, 0, 6))) throw new TypeError('Invalid GIF')
    return { w: readUInt16LE(buf, 6), h: readUInt16LE(buf, 8) }
  }

  private parsePng(buf: Uint8Array): { w: number; h: number } {
    if (toUTF8String(buf, 1, 8) !== 'PNG\r\n\x1a\n') throw new TypeError('Invalid PNG')
    if (toUTF8String(buf, 12, 16) === 'CgBI') {
      return { w: readUInt32BE(buf, 32), h: readUInt32BE(buf, 36) }
    }
    if (toUTF8String(buf, 12, 16) !== 'IHDR') throw new TypeError('Invalid PNG')
    return { w: readUInt32BE(buf, 16), h: readUInt32BE(buf, 20) }
  }

  private parseJpeg(buf: Uint8Array): { w: number; h: number } {
    if (toHexString(buf, 0, 2) !== 'ffd8') throw new TypeError('Invalid JPG')

    const EXIF_MARKER = '45786966'
    const isEXIF = (input: Uint8Array) => toHexString(input, 2, 6) === EXIF_MARKER
    const extractSize = (input: Uint8Array, index: number) => ({
      height: readUInt16BE(input, index),
      width: readUInt16BE(input, index + 2),
    })
    const extractOrientation = (exifBlock: Uint8Array, isBigEndian: boolean) => {
      const offset = 14
      const idfDirectoryEntries = readUInt(exifBlock, 16, offset, isBigEndian)
      for (let i = 0; i < idfDirectoryEntries; i++) {
        const start = offset + 2 + i * 12
        if (start + 12 > exifBlock.length) return
        const tagNumber = readUInt(exifBlock, 16, start, isBigEndian)
        if (tagNumber === 274) {
          const dataFormat = readUInt(exifBlock, 16, start + 2, isBigEndian)
          if (dataFormat !== 3) return
          const numberOfComponents = readUInt(exifBlock, 32, start + 4, isBigEndian)
          if (numberOfComponents !== 1) return
          return readUInt(exifBlock, 16, start + 8, isBigEndian)
        }
      }
    }
    const validateExifBlock = (input: Uint8Array, index: number) => {
      const exifBlock = input.slice(2, index)
      const byteAlign = toHexString(exifBlock, 6, 8)
      if (byteAlign === '4d4d' || byteAlign === '4949') {
        return extractOrientation(exifBlock, byteAlign === '4d4d')
      }
    }

    let inputSlice = buf.slice(4)
    while (inputSlice.length) {
      const i = readUInt16BE(inputSlice, 0)
      if (i > inputSlice.length) throw new TypeError('Corrupt JPG, exceeded buffer limits')
      if (inputSlice[i] !== 0xff) {
        inputSlice = inputSlice.slice(1)
        continue
      }
      if (isEXIF(inputSlice)) validateExifBlock(inputSlice, i)
      const next = inputSlice[i + 1]
      if (next === 0xc0 || next === 0xc1 || next === 0xc2) {
        const size = extractSize(inputSlice, i + 5)
        return { w: size.width, h: size.height }
      }
      inputSlice = inputSlice.slice(i + 2)
    }
    throw new TypeError('Invalid JPG, no size found')
  }

  private parseBmp(buf: Uint8Array): { w: number; h: number } {
    if (toUTF8String(buf, 0, 2) !== 'BM') throw new TypeError('Invalid BMP')
    return { w: readUInt32LE(buf, 18), h: Math.abs(readInt32LE(buf, 22)) }
  }

  private parseIco(buf: Uint8Array): { w: number; h: number } {
    if (readUInt16LE(buf, 0) !== 0 || readUInt16LE(buf, 4) === 0 || readUInt16LE(buf, 2) !== 1) {
      throw new TypeError('Invalid ICO')
    }
    return { w: buf[6] === 0 ? 256 : buf[6], h: buf[7] === 0 ? 256 : buf[7] }
  }

  private parseWebp(buf: Uint8Array): { w: number; h: number } {
    if (toUTF8String(buf, 0, 4) !== 'RIFF' || toUTF8String(buf, 8, 12) !== 'WEBP') {
      throw new TypeError('Invalid WebP')
    }
    const chunkHeader = toUTF8String(buf, 12, 16)
    const data = buf.slice(20, 30)
    if (chunkHeader === 'VP8X') {
      if ((data[0] & 0xc0) !== 0 || (data[0] & 0x01) !== 0) throw new TypeError('Invalid WebP')
      return { w: 1 + readUInt24LE(data, 4), h: 1 + readUInt24LE(data, 7) }
    }
    if (chunkHeader === 'VP8 ' && data[0] !== 0x2f) {
      return { w: readInt16LE(data, 6) & 0x3fff, h: readInt16LE(data, 8) & 0x3fff }
    }
    if (chunkHeader === 'VP8L' && toHexString(data, 3, 6) !== '9d012a') {
      return {
        w: 1 + (((data[2] & 0x3f) << 8) | data[1]),
        h: 1 + (((data[4] & 0xf) << 10) | (data[3] << 2) | ((data[2] & 0xc0) >> 6)),
      }
    }
    throw new TypeError('Invalid WebP')
  }
}

export const imageParser = new ImageParser()
