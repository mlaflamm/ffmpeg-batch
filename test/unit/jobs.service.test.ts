import fs from 'fs';
import path from 'path';

import { assert } from 'chai';
import nodeAssert from 'assert';

import { JobsService } from '../../src/libs/jobs.service';
import { JobsRepository } from '../../src/libs/jobs.repository';
import { getSampleVideoFile, randomString } from '../fixtures';
import { readLastLine } from '../../src/libs/utils/read-last-line';

describe('Job service', () => {
  const testDir = path.join('.test', randomString());

  beforeEach(async () => {
    await fs.promises.rmdir(testDir, { recursive: true });
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.promises.rmdir('.test', { recursive: true });
  });

  describe('queue job', () => {
    it('should save job with input video info', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);

      const sampleVideoFile = await getSampleVideoFile('mp4');
      const jobData = { inputFilePath: sampleVideoFile, outFilePath: 'output', scriptName: 'test.sh' };
      const queuedJob = await service.queueJob(jobData);

      assert.isString(queuedJob.jobId);
      assert.equal(queuedJob.inputFilePath, sampleVideoFile);
      assert.equal(queuedJob.outFilePath, 'output');
      assert.equal(queuedJob.scriptName, 'test.sh');
      assert.hasAllKeys(queuedJob.inputFileInfo, [
        'fileSize',
        'width',
        'height',
        'duration',
        'bit_rate',
        'codec_name',
        'display_aspect_ratio',
      ]);
    });

    it('should not fail if cannot extract video stream info from input file', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);

      const inputFilePath = __filename; // file exist but not a video
      const jobData = { inputFilePath, outFilePath: 'output', scriptName: 'test.sh' };
      const queuedJob = await service.queueJob(jobData);

      assert.isNumber(queuedJob.inputFileInfo?.fileSize);
      assert.hasAllKeys(queuedJob.inputFileInfo, ['fileSize']);
    });

    it('should fail if input file does not exist', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);

      const jobData = { inputFilePath: 'unknown', outFilePath: 'output', scriptName: 'test.sh' };
      await nodeAssert.rejects(() => service.queueJob(jobData));
    });

    it('should fail if input file is a directory', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);

      const jobData = { inputFilePath: __dirname, outFilePath: 'output', scriptName: 'test.sh' };
      await nodeAssert.rejects(() => service.queueJob(jobData));
    });
  });

  describe('execute job', () => {
    it('should execute successful job', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);
      const job = await repository.addJob({
        inputFilePath: '+5+0.2+0+',
        outFilePath: 'some % dir/some % file',
        scriptName: 'test.sh',
      });

      const doneJobId = await service.executeJob(job);
      if (!doneJobId) {
        throw new Error('Should be defined!');
      }

      // Verify job done
      assert.equal(doneJobId, job.jobId.replace('todo', 'done'));
      assert.isNotOk(fs.existsSync(repository.getJobPath(job.jobId)));
      assert.isOk(fs.existsSync(repository.getJobPath(doneJobId)));

      const expected = `{"inputFilePath":"+5+0.2+0+","outFilePath":"some % dir/some % file","scriptName":"test.sh"}

+5+0.2+0+
some %% dir/some %% file
0
1
2
3
4

`;

      const jobOutput = await fs.promises.readFile(repository.getJobPath(doneJobId), { encoding: 'utf8' });
      const lastLine = await readLastLine(repository.getJobPath(doneJobId));
      assert.equal(jobOutput.slice(0, -lastLine.length), expected);

      const result = JSON.parse(lastLine);
      assert.deepEqual(Object.keys(result).sort(), ['durationMs', 'startedAt']);
      assert.isAtLeast(result.durationMs, 1000);
      assert.isAtLeast(new Date(result.startedAt).getTime(), Date.now() - 2000);
      assert.isAtMost(new Date(result.startedAt).getTime(), Date.now());
    });

    it('should execute failed job', async () => {
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);
      const job = await repository.addJob({
        inputFilePath: '+5+0.2+1+',
        outFilePath: 'some % dir/some % file',
        scriptName: 'test.sh',
      });

      const errorJobId = await service.executeJob(job);
      if (!errorJobId) {
        throw new Error('Should be defined!');
      }

      // Verify job error
      assert.equal(errorJobId, job.jobId.replace('todo', 'error'));
      assert.isNotOk(fs.existsSync(repository.getJobPath(job.jobId)));
      assert.isOk(fs.existsSync(repository.getJobPath(errorJobId)));

      const lastLine = await readLastLine(repository.getJobPath(errorJobId));
      const result = JSON.parse(lastLine);
      assert.deepEqual(Object.keys(result).sort(), ['durationMs', 'startedAt']);
    });
  });
});
