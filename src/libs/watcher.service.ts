import namespace from 'debug';
import { Service } from 'typedi';
import fs from 'fs';
import path from 'path';

import { JobsService } from './jobs.service';
import { pLoop } from './utils/promise-loop';

const debug = namespace('ffmpeg-batch:watcher.service');

async function asFile(
  dirPath: string,
  entry: fs.Dirent,
  prefix: string = '-'
): Promise<{ ok: boolean; fullPath: string; sortValue: number }> {
  if (entry.isDirectory() && entry.name.startsWith(prefix)) {
    const subdirPath = path.join(dirPath, entry.name);
    const children = (await fs.promises.readdir(subdirPath)).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.mp4', '.mov', '.m4v', '.mkv'].includes(ext);
    });
    if (children.length === 1) {
      const fullPath = path.join(subdirPath, children[0]);
      const stat = await fs.promises.stat(subdirPath);
      return { ok: true, fullPath, sortValue: stat.mtimeMs };
    }
  }

  return { ok: false, fullPath: '', sortValue: -1 };
}

export async function scan(dirPath: string): Promise<string[]> {
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
  return (await Promise.all(files.map(entry => asFile(dirPath, entry))))
    .filter(i => i.ok)
    .sort((i1, i2) => i1.sortValue - i2.sortValue)
    .map(i => i.fullPath);
}

export async function transform(dirPath: string): Promise<{ oldPath: string; newPath: string }[]> {
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
  return (
    await Promise.all(
      files.map(async entry => {
        if (
          entry.isDirectory() &&
          entry.name.slice(0, 1) === '_' &&
          !entry.name.startsWith('_UNPACK_') &&
          (await asFile(dirPath, entry, '_')).ok
        ) {
          const oldPath = path.join(dirPath, entry.name);
          const newPath = path.join(dirPath, '-' + entry.name.slice(1));
          await fs.promises.rename(oldPath, newPath);
          return { oldPath, newPath };
        }

        return { oldPath: '', newPath: '' };
      })
    )
  ).filter(i => i.oldPath || i.newPath);
}

@Service()
export class WatcherService {
  private stopWatchLoop?: () => void = undefined;

  constructor(
    private readonly jobsService: JobsService,
    private readonly watchDir: string,
    private readonly defaultScriptName: string = 'scale.sh'
  ) {}

  start(pollIntervalMs: number) {
    if (!this.stopWatchLoop) {
      debug('start watching directory %s', this.watchDir);
      this.stopWatchLoop = pLoop(() => this.process(), pollIntervalMs);
    }
  }

  stop() {
    if (this.stopWatchLoop) {
      debug('stop watching directory %s', this.watchDir);
      this.stopWatchLoop();
      this.stopWatchLoop = undefined;
    }
  }

  async process() {
    debug('scanning for pending files in "%s"', this.watchDir);
    await transform(this.watchDir);
    const files = await scan(this.watchDir);
    if (files.length === 0) {
      return;
    }

    for (const inputFilePath of files) {
      const ext = path.extname(inputFilePath);
      const baseName = path.basename(inputFilePath).slice(0, -ext.length) + '.mp4';
      const outFilePath = path.join(path.dirname(inputFilePath), '_' + baseName);
      await this.jobsService.queueJob({ inputFilePath, outFilePath, scriptName: this.defaultScriptName });
    }
  }
}
