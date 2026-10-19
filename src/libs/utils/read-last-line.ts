import fs from 'fs';

// Read backwards rather than loading a potentially multi-gigabyte conversion log.
// Job result JSON must fit in one MiB; reject oversized records instead of growing without bound.
export async function readLastLine(pathToFile: string): Promise<string> {
  const file = await fs.promises.open(pathToFile, 'r');
  try {
    let position = (await file.stat()).size;
    let length = 0;
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(64 * 1024);
    while (position > 0) {
      const size = Math.min(position, buffer.length);
      position -= size;
      const { bytesRead } = await file.read(buffer, 0, size, position);
      let end = bytesRead;
      if (!length) while (end > 0 && (buffer[end - 1] === 10 || buffer[end - 1] === 13)) end--;
      if (!end) continue;
      let start = end;
      while (start > 0 && buffer[start - 1] !== 10 && buffer[start - 1] !== 13) start--;
      const chunk = Buffer.from(buffer.subarray(start, end));
      length += chunk.length;
      if (length > 1024 * 1024) throw new Error(`Last line in ${pathToFile} exceeds one MiB`);
      chunks.push(chunk);
      if (start > 0 || position === 0) return Buffer.concat(chunks.reverse()).toString('utf8');
    }
    throw new Error(`File ${pathToFile} is empty!`);
  } finally {
    await file.close();
  }
}
