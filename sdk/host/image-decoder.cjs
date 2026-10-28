const zlib = require('node:zlib');

function decodePng(buf) {
  let pos = 8, idats = [], width = 0, height = 0, colorType = 6;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      colorType = buf.readUInt8(pos + 17);
    } else if (type === 'IDAT') {
      idats.push(buf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const srcBpp = colorType === 2 ? 3 : 4;
  const srcRowBytes = width * srcBpp;
  const out = Buffer.alloc(width * height * 4);
  let prevRow = Buffer.alloc(srcRowBytes);
  const curRow = Buffer.alloc(srcRowBytes);

  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (1 + srcRowBytes)];
    const rowIn = inflated.subarray(y * (1 + srcRowBytes) + 1, (y + 1) * (1 + srcRowBytes));

    if (filter === 0) {
      rowIn.copy(curRow);
    } else if (filter === 1) { // Sub
      for (let x = 0; x < srcRowBytes; x++) {
        curRow[x] = (rowIn[x] + (x >= srcBpp ? curRow[x - srcBpp] : 0)) & 0xff;
      }
    } else if (filter === 2) { // Up
      for (let x = 0; x < srcRowBytes; x++) {
        curRow[x] = (rowIn[x] + prevRow[x]) & 0xff;
      }
    } else if (filter === 3) { // Average
      for (let x = 0; x < srcRowBytes; x++) {
        const a = x >= srcBpp ? curRow[x - srcBpp] : 0;
        const b = prevRow[x];
        curRow[x] = (rowIn[x] + ((a + b) >> 1)) & 0xff;
      }
    } else if (filter === 4) { // Paeth
      for (let x = 0; x < srcRowBytes; x++) {
        const a = x >= srcBpp ? curRow[x - srcBpp] : 0;
        const b = prevRow[x];
        const c = x >= srcBpp ? prevRow[x - srcBpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        curRow[x] = (rowIn[x] + pr) & 0xff;
      }
    }

    // Convert curRow to 4-byte RGBA in output buffer
    const outRow = out.subarray(y * width * 4, (y + 1) * width * 4);
    if (srcBpp === 4) {
      curRow.copy(outRow);
    } else {
      for (let px = 0; px < width; px++) {
        outRow[px * 4 + 0] = curRow[px * 3 + 0];
        outRow[px * 4 + 1] = curRow[px * 3 + 1];
        outRow[px * 4 + 2] = curRow[px * 3 + 2];
        outRow[px * 4 + 3] = 255;
      }
    }
    curRow.copy(prevRow);
  }

  return { width, height, data: out };
}

module.exports = { decodePng };
