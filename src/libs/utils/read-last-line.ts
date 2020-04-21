import fs from 'fs';

const sliceFile = require('slice-file');

export async function readLastLine(pathToFile: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let line: string | undefined;
    const file = sliceFile(pathToFile);
    file
      .sliceReverse(-1, 1)
      .on('data', function (data: any) {
        line = data.toString();
      })
      .on('end', function () {
        fs.close(file.fd, () => {
          if (!line) {
            return reject(new Error(`File ${pathToFile} is empty!`));
          }
          return resolve(line);
        });
      })
      .on('error', function (err: any) {
        if (err instanceof Buffer) {
          // TODO: create a PR fix
          // Work around 'slice-file' bug
          line = err.toString();
          return;
        }
        fs.close(file.fd, () => {
          reject(err);
        });
      });
  });
}
