import fs from 'fs';
import readline from 'readline';

// Adapted from the following stack overflow answer with proper error handling and stream cleanup.
// https://stackoverflow.com/questions/28747719/what-is-the-most-efficient-way-to-read-only-the-first-line-of-a-file-in-node-js#answer-60193465

export async function readFirstLine(pathToFile: string): Promise<string> {
  const readable = fs.createReadStream(pathToFile);
  const reader = readline.createInterface({ input: readable });
  const line = await new Promise<string>((resolve, reject) => {
    const onError = (err: Error) => {
      reader.close();
      readable.destroy();
      reject(err);
    };
    readable.once('error', onError);
    reader
      .once('line', (line: string) => {
        reader.close();
        readable.close();
        resolve(line);
      })
      .once('error', onError);
  });
  return line;
}
