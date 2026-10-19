import { assert } from 'chai';
import nodeAssert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createApplication } from '../../src/app.js';
import { JobsRepository } from '../../src/libs/jobs.repository.js';
import { JobsService } from '../../src/libs/jobs.service.js';
import { ProcessRunner } from '../../src/libs/utils/process-runner.js';
import { eventually } from '../../src/libs/utils/eventually.js';
import { getSampleVideoFile } from '../fixtures.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Application lifecycle', () => {
  after(() => fs.promises.rm('.test/lifecycle', { recursive: true, force: true }));

  it('closes repeatedly, including paused polling, HTTP and cleanup timers', async () => {
    for (let i = 0; i < 3; i++) {
      const application = await createApplication('test');
      await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
      await Promise.all([application.close(), application.close()]);
      assert.isFalse(application.server.listening);
      await nodeAssert.rejects(() => application.jobs.getNextJob(), /stopped/);
    }
  });

  it('fails startup cleanly when the HTTP port is already occupied', async () => {
    const application = await createApplication('test');
    try {
      await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
      const address = application.server.address();
      assert.isObject(address);
      const port = typeof address === 'object' && address ? address.port : 0;
      await nodeAssert.rejects(
        promisify(execFile)(process.execPath, ['dist/server.js'], {
          env: { ...process.env, PORT: String(port), JOBS_ENABLED: 'false', WATCH_ENABLED: 'false' },
          timeout: 3000,
        }),
        (err: any) => err.code === 1 && /EADDRINUSE/.test(err.stderr)
      );
    } finally {
      await application.close();
    }
  });

  it('forces a resistant process group after five seconds and leaves no writer', async function () {
    this.timeout(8000);
    await fs.promises.mkdir('.test/lifecycle', { recursive: true });
    const marker = '.test/lifecycle/writer';
    const runner = new ProcessRunner();
    const running = runner.run('/bin/bash', [
      '-c',
      `trap '' TERM; (trap '' TERM; while true; do echo x >> "$1"; sleep .02; done) & wait`,
      'writer',
      marker,
    ]);
    // Attach the rejection handler before shutdown sends a signal.
    const finished = running.catch(() => undefined);
    await eventually(async () => assert.isAbove((await fs.promises.stat(marker)).size, 0), 10, 2000);
    const start = Date.now();
    await runner.close();
    await finished;
    assert.isAtLeast(Date.now() - start, 4900);
    assert.isBelow(Date.now() - start, 7000);
    const size = (await fs.promises.stat(marker)).size;
    await delay(100);
    assert.equal((await fs.promises.stat(marker)).size, size);
  });

  it('interrupts real FFmpeg, preserves its started job, and recovers playable output', async function () {
    this.timeout(30000);
    const dir = '.test/lifecycle/conversion';
    await fs.promises.mkdir(dir, { recursive: true });
    const input = path.join(dir, 'long input.mp4');
    const output = path.join(dir, 'output.mp4');
    await promisify(execFile)('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      await getSampleVideoFile('mp4'),
      '-t',
      '30',
      '-c',
      'copy',
      input,
    ]);
    const repository = new JobsRepository(path.join(dir, 'jobs'));
    const service = new JobsService(repository);
    const job = await service.queueJob({ inputFilePath: input, outFilePath: output, scriptName: 'scale.sh' });
    await service.stop();
    const child = spawn(process.execPath, ['dist/server.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JOBS_ENABLED: 'true',
        JOBS_DIR: path.join(dir, 'jobs'),
        WATCH_ENABLED: 'false',
        PORT: '0',
        JOBS_CLEANUP_INTERVAL: '0',
        DEBUG: '',
      },
      stdio: 'ignore',
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    try {
      await eventually(async () => assert.isAbove((await fs.promises.stat(output)).size, 0), 10, 3000);
      const stopTime = Date.now();
      child.kill('SIGTERM');
      assert.equal(await exited, 0);
      assert.isBelow(Date.now() - stopTime, 8000);
      const startedId = path.basename(job.jobId);
      assert.isTrue(fs.existsSync(repository.getJobPath(startedId)));
      assert.deepEqual(await fs.promises.readdir(path.join(dir, 'jobs/error')), []);
      const size = (await fs.promises.stat(output)).size;
      await delay(100);
      assert.equal((await fs.promises.stat(output)).size, size);
      const stale = new Date(Date.now() - 61000);
      await fs.promises.utimes(repository.getJobPath(startedId), stale, stale);
      const restarted = new JobsService(repository);
      try {
        const recovered = await restarted.getNextJob();
        assert.equal(recovered.jobId, startedId);
        assert.match((await restarted.executeJob(recovered))!, /^done\//);
        await promisify(execFile)('ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-']);
      } finally {
        await restarted.stop();
      }
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
      await exited;
    }
  });
});
