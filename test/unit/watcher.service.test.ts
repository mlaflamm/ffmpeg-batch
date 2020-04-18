import fs from 'fs';
import path from 'path';
import touch from 'touch';

import { assert } from 'chai';

import { scan, transform, WatcherService } from '../../src/libs/watcher.service';
import { JobsRepository } from '../../src/libs/jobs.repository';
import { randomString } from '../fixtures';

describe('Watcher service', () => {
  const testDir = path.join('.test', randomString());
  const watchDir = path.join(testDir, 'watch');
  const jobsDir = path.join(testDir, 'jobs');

  const mkFiles = async (dirName: string, fileNames: string[], time: Date = new Date()) => {
    await fs.promises.mkdir(path.join(watchDir, dirName), { recursive: true });
    for (const name of fileNames) {
      await touch(path.join(watchDir, dirName, name));
    }
    await touch(path.join(watchDir, dirName), { time });
    return fileNames.map(name => path.join(watchDir, dirName, name));
  };

  beforeEach(async () => {
    await fs.promises.rmdir(testDir, { recursive: true });
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.promises.rmdir('.test', { recursive: true });
  });

  it('should scan files', async () => {
    await mkFiles('-ok-now', ['test.mp4']);
    await mkFiles('-ok-after', ['test.mov'], new Date(Date.now() + 600000));
    await mkFiles('-ok-before', ['test.m4v'], new Date(Date.now() - 600000));
    await mkFiles('-skip-multiple-files', ['test.mp4', 'test.mov']);
    await mkFiles('-skip-empty', []);
    await mkFiles('-skip-incompatible-files', ['test.txt']);
    await mkFiles('skip-no-prefix', ['test.mp4']);
    await mkFiles('_skip-wrong-prefix', ['test.mp4']);

    const scannedFiles = await scan(watchDir);
    assert.deepEqual(scannedFiles, [
      path.join(watchDir, '-ok-before', 'test.m4v'),
      path.join(watchDir, '-ok-now', 'test.mp4'),
      path.join(watchDir, '-ok-after', 'test.mov'),
    ]);
  });

  it('should transform and scan', async () => {
    await mkFiles('-ok-now', ['test.mp4']);
    await mkFiles('-skip-multiple-files', ['test.mp4', 'test.mov']);
    await mkFiles('-skip-empty', []);
    await mkFiles('-skip-incompatible-files', ['test.txt']);
    await mkFiles('skip-no-prefix', ['test.mp4']);
    await mkFiles('_ok-transform', ['test.mp4'], new Date(Date.now() - 600000));
    await mkFiles('_skip-transform-empty', []);
    await mkFiles('_skip-transform-multiple-files', ['test.mp4', 'test.mov']);
    await mkFiles('_UNPACK_skip-unpack', ['test.mp4']);

    const transformedFiles = await transform(watchDir);
    assert.deepEqual(transformedFiles, [
      { newPath: path.join(watchDir, '-ok-transform'), oldPath: path.join(watchDir, '_ok-transform') },
    ]);

    const scannedFiles = await scan(watchDir);
    assert.deepEqual(scannedFiles, [
      path.join(watchDir, '-ok-transform', 'test.mp4'),
      path.join(watchDir, '-ok-now', 'test.mp4'),
    ]);
  });

  describe('process', () => {
    it('should add new pending jobs', async () => {
      const jobsRepository = new JobsRepository(jobsDir);
      const watcher = new WatcherService(jobsRepository, watchDir);

      const inputFiles = [
        ...(await mkFiles('-ok-now', ['test.mp4'])),
        ...(await mkFiles('_ok-transform', ['test.mov'])).map(f => f.replace(/_/g, '-')),
      ];

      // ensure no pending jobs before
      assert.deepEqual(await jobsRepository.getIncompleteJobs(), []);

      await watcher.process();

      const pendingJobs = await jobsRepository.getIncompleteJobs();
      assert.lengthOf(pendingJobs, 2);
      for (const job of pendingJobs) {
        if (!job) {
          throw new Error('Should be defined!');
        }
        assert.include(inputFiles, job.inputFilePath);
        assert.equal(path.basename(job.outFilePath), '_test.mp4');
        assert.equal(job.scriptName, 'scale.sh');
      }
    });

    it('should NOT add duplicate pending jobs', async () => {
      const jobsRepository = new JobsRepository(jobsDir);
      const watcher = new WatcherService(jobsRepository, watchDir);

      await mkFiles('-ok-now', ['test.mp4']);
      await mkFiles('_ok-transform', ['test.mov']);

      await watcher.process();
      await watcher.process();
      assert.lengthOf(Object.values(await jobsRepository.getIncompleteJobs()), 2);

      await mkFiles('-ok-new', ['test.mp4']);
      await watcher.process();
      assert.lengthOf(Object.values(await jobsRepository.getIncompleteJobs()), 3);
    });

    it('should NOT add duplicate started job', async () => {
      const jobsRepository = new JobsRepository(jobsDir);
      const watcher = new WatcherService(jobsRepository, watchDir);

      await mkFiles('-ok-now', ['test.mp4']);
      await mkFiles('_ok-transform', ['test.mov']);

      await watcher.process();
      assert.lengthOf(Object.values(await jobsRepository.getIncompleteJobs()), 2);

      const nextJob = await jobsRepository.getNextJob();
      if (!nextJob) {
        throw new Error('Should not be undefined!');
      }
      await jobsRepository.startJob(nextJob.jobId);
      assert.lengthOf(Object.values(await jobsRepository.getIncompleteJobs()), 2);

      await watcher.process();
      assert.lengthOf(Object.values(await jobsRepository.getIncompleteJobs()), 2);
    });
  });
});
