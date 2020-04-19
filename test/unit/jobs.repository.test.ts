import fs from 'fs';
import path from 'path';

import { assert } from 'chai';

import { JobsRepository } from '../../src/libs/jobs.repository';
import { Job } from '../../src/libs/job.model';
import * as fixture from '../fixtures';

describe('Job repository', () => {
  const testDir = path.join('.test', fixture.randomString());

  const createJob = async (job: Job, time: Date = new Date()) => fixture.createJob(testDir, job, time);

  beforeEach(async () => {
    await fs.promises.rmdir(testDir, { recursive: true });
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.promises.rmdir('.test', { recursive: true });
  });

  describe('get job', () => {
    it('should return nothing when job does not exist', async () => {
      const repository = new JobsRepository(testDir);
      assert.isUndefined(await repository.getJob('unknown.job'));
    });

    it('should return expected job when exists', async () => {
      const repository = new JobsRepository(testDir);

      const jobId = 'test.job';
      const job = { jobId, inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob(job);

      assert.deepEqual(await repository.getJob(jobId), job);
    });

    it('should return expected job when exists - todo', async () => {
      const repository = new JobsRepository(testDir);

      const jobId = 'todo/test.job';
      const job = { jobId, inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob(job);

      assert.deepEqual(await repository.getJob(jobId), job);
    });

    it('should return expected job when exists - done', async () => {
      const repository = new JobsRepository(testDir);

      const jobId = 'done/test.job';
      const job = { jobId, inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob(job);

      assert.deepEqual(await repository.getJob(jobId), job);
    });

    it('should return expected job when exists - error', async () => {
      const repository = new JobsRepository(testDir);

      const jobId = 'error/test.job';
      const job = { jobId, inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob(job);

      assert.deepEqual(await repository.getJob(jobId), job);
    });
  });

  describe('list all job ids', () => {
    it('should return nothing when no jobs exist', async () => {
      const repository = new JobsRepository(testDir);
      assert.deepEqual(await repository.getAllJobIds(), []);
    });

    it('should return expected job ids', async () => {
      const repository = new JobsRepository(testDir);

      const job = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob({ jobId: 'test.job', ...job });
      await createJob({ jobId: 'todo/test1.job', ...job });
      await createJob({ jobId: 'todo/test2.job', ...job });
      await createJob({ jobId: 'done/test.job', ...job });
      await createJob({ jobId: 'error/test.job', ...job });

      assert.deepEqual(await repository.getAllJobIds(), [
        'test.job',
        'todo/test1.job',
        'todo/test2.job',
        'done/test.job',
        'error/test.job',
      ]);
    });
  });

  describe('add job', () => {
    it('should be successful', async () => {
      const repository = new JobsRepository(testDir);
      const jobData = {
        inputFilePath: 'ancestor/Some Parent/input.mp4',
        outFilePath: 'ancestor/Some Parent/_output.mp4',
        scriptName: 'fake.sh',
      };

      const addedJob = await repository.addJob(jobData);
      assert.deepEqual(await repository.getJob(addedJob.jobId), { jobId: addedJob.jobId, ...jobData });

      // status
      assert.equal(path.dirname(addedJob.jobId), 'todo');

      // name
      const [timestamp, jobName] = path.basename(addedJob.jobId).split('_');
      assert.isAtMost(+timestamp, Date.now());
      assert.isAtLeast(+timestamp, Date.now() - 5000);
      assert.equal(jobName, 'Some Parent.job');
    });
  });

  describe('next job', () => {
    it('should return expected job id - ignore in progress', async () => {
      const repository = new JobsRepository(testDir);
      const job = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };

      await createJob({ jobId: 'todo/job99.job', ...job });
      await createJob({ jobId: 'job66.job', ...job });
      await createJob({ jobId: 'todo/job33.job', ...job });
      await createJob({ jobId: 'job00.job', ...job });

      assert.deepEqual(await repository.getNextJob(), { jobId: 'todo/job33.job', ...job });
    });

    it('should return expected job id - select stalled job', async () => {
      const repository = new JobsRepository(testDir);
      const job = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };

      await createJob({ jobId: 'job99.job', ...job }, new Date(Date.now() - 60000));
      await createJob({ jobId: 'job66', ...job }, new Date(Date.now() - 60000)); // bad extension);
      await createJob({ jobId: 'todo/job33.job', ...job });
      await createJob({ jobId: 'job00.job', ...job });

      assert.deepEqual(await repository.getNextJob(), { jobId: 'job99.job', ...job });
    });

    it('should return nothing when no pending jobs', async () => {
      const repository = new JobsRepository(testDir);
      assert.isUndefined(await repository.getNextJob());
    });
  });

  describe('start job', () => {
    it('should move job from todo directory', async () => {
      const repository = new JobsRepository(testDir);
      const job = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      await createJob({ jobId: 'todo/job99.job', ...job });

      const startedJob = await repository.startJob('todo/job99.job');
      if (!startedJob) {
        throw new Error('Should not be undefined!');
      }

      assert.deepEqual(startedJob, { jobId: 'job99.job', ...job });
      assert.deepEqual(await repository.getJob(startedJob.jobId), startedJob);
      assert.deepEqual(await repository.getAllJobIds(), ['job99.job']);
    });

    it('should NOT move stalled job but update time', async () => {
      const repository = new JobsRepository(testDir);
      const job = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
      const initialJobModifiedTime = Date.now() - 60000;
      await createJob({ jobId: 'job99.job', ...job }, new Date(initialJobModifiedTime));

      const startedJob = await repository.startJob('job99.job');
      if (!startedJob) {
        throw new Error('Should not be undefined!');
      }

      assert.deepEqual(startedJob, { jobId: 'job99.job', ...job });
      assert.deepEqual(await repository.getJob(startedJob.jobId), startedJob);
      assert.deepEqual(await repository.getAllJobIds(), ['job99.job']);
      assert.isAbove(fs.statSync(path.join(testDir, 'job99.job')).mtimeMs, initialJobModifiedTime + 59000);
    });

    it('should skip unknown job and not create a ghost job', async () => {
      const repository = new JobsRepository(testDir);

      const startedJob = await repository.startJob('todo/unknown.job');
      assert.isUndefined(startedJob);
      assert.deepEqual(await repository.getAllJobIds(), []);
    });
  });

  describe('list incomplete jobs', () => {
    it('should returns incomplete jobs including started', async () => {
      const repository = new JobsRepository(testDir);
      const job = (jobId: string, suffix: string) => ({
        jobId,
        inputFilePath: 'input' + suffix,
        outFilePath: 'output' + suffix,
        scriptName: 'test.sh',
      });

      await createJob(job('job99.job', '99'), new Date(Date.now() - 61000)); // started & stalled
      await createJob(job('job66', '66'), new Date(Date.now() - 60000)); // bad extension
      await createJob(job('todo/job33.job', '33'));
      await createJob(job('job00.job', '00')); // started, not stalled

      const expected = [job('job00.job', '00'), job('job99.job', '99'), job('todo/job33.job', '33')];
      assert.deepEqual(await repository.getIncompleteJobs(), expected);
    });

    it('should return an empty array when no pending jobs', async () => {
      const repository = new JobsRepository(testDir);
      assert.deepEqual(await repository.getIncompleteJobs(), []);
    });
  });
});