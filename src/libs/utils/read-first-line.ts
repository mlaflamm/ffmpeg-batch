import fs from 'fs';
import readline from 'readline';

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
