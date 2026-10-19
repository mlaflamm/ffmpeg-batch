import fs from 'fs';
import { StringDecoder } from 'string_decoder';
import { pLoop } from './promise-loop.js';

const chunkSize = 64 * 1024;

// Follow from byte zero. CR, LF and CRLF delimit progress; empty lines are omitted.
// Keep an unfinished line between reads. Very long lines stream in bounded chunks.
export function followFile(
  filePath: string,
  onLine: (line: string) => void,
  onError: (err: Error) => void,
  interval = 100
): () => Promise<void> {
  let handle: fs.promises.FileHandle | undefined;
  let position = 0;
  let pending = '';
  let decoder = new StringDecoder('utf8');
  let stopping = false;
  let closing: Promise<void> | undefined;
  const buffer = Buffer.alloc(chunkSize);
  const stopLoop = pLoop(async () => {
    if (stopping) return;
    try {
      if (!handle) handle = await fs.promises.open(filePath, 'r');
      const { size } = await handle.stat();
      if (size < position) {
        position = 0;
        pending = '';
        decoder = new StringDecoder('utf8');
      }
      while (!stopping && position < size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, size - position), position);
        if (!bytesRead) break;
        position += bytesRead;
        const lines = (pending + decoder.write(buffer.subarray(0, bytesRead))).split(/[\r\n]/);
        pending = lines.pop() || '';
        for (const line of lines) if (line) onLine(line + '\n');
        while (pending.length > chunkSize) {
          const end = /[\uD800-\uDBFF]/.test(pending[chunkSize - 1]) ? chunkSize - 1 : chunkSize;
          onLine(pending.slice(0, end));
          pending = pending.slice(end);
        }
      }
    } catch (err) {
      stopping = true;
      void stopLoop();
      await handle?.close();
      handle = undefined;
      onError(err as Error);
    }
  }, interval);
  return () => {
    if (closing) return closing;
    stopping = true;
    closing = (async () => {
      await stopLoop();
      try {
        pending += decoder.end();
        if (pending) onLine(pending + '\n');
      } finally {
        pending = '';
        await handle?.close();
        handle = undefined;
      }
    })();
    return closing;
  };
}
