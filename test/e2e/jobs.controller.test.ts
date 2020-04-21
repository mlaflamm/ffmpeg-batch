import fs from 'fs';

import { assert } from 'chai';
import { SuperTest, Test } from 'supertest';

import { getFixtures, Fixtures, assertStatus, createJob } from '../fixtures';
import { JobData } from '../../src/libs/job.model';
import * as path from 'path';
import { eventually } from '../../src/libs/utils/eventually';

describe('Jobs api routes', () => {
  let fixtures: Fixtures;
  let request: SuperTest<Test>;
  let jobDir: string;

  before(async () => {
    fixtures = await getFixtures();
    request = fixtures.request;
    jobDir = fixtures.env.jobs.dir;
  });

  beforeEach(async () => {
    // TODO: move to fixture
    const deleteRecursiveFiles = async (dirPath: string) => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await deleteRecursiveFiles(path.join(dirPath, entry.name));
        } else {
          await fs.promises.unlink(path.join(dirPath, entry.name));
        }
      }
    };

    await deleteRecursiveFiles(jobDir);
  });

  after(() => fixtures.release());

  describe('Get all jobs - GET /api/jobs', () => {
    const jobData: JobData = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
    beforeEach(async () => {
      await createJob(jobDir, { jobId: 'test1.job', ...jobData });
      await createJob(jobDir, { jobId: 'todo/test2.job', ...jobData });
      await createJob(jobDir, { jobId: 'todo/test3.job', ...jobData });
      await createJob(jobDir, { jobId: 'done/test4.job', ...jobData });
      await createJob(jobDir, { jobId: 'error/test5.job', ...jobData });
    });

    it('should returns all jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [
        { id: 'error/test5.job', name: 'test5', status: 'error' },
        { id: 'done/test4.job', name: 'test4', status: 'done' },
        { id: 'todo/test3.job', name: 'test3', status: 'todo' },
        { id: 'todo/test2.job', name: 'test2', status: 'todo' },
        { id: 'test1.job', name: 'test1', status: 'started' },
      ]);
    });

    it('should returns started jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=started');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ id: 'test1.job', name: 'test1', status: 'started' }]);
    });

    it('should returns todo jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=todo');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [
        { id: 'todo/test3.job', name: 'test3', status: 'todo' },
        { id: 'todo/test2.job', name: 'test2', status: 'todo' },
      ]);
    });

    it('should returns done jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=done');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ id: 'done/test4.job', name: 'test4', status: 'done' }]);
    });

    it('should returns jobs with status error', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=error');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ id: 'error/test5.job', name: 'test5', status: 'error' }]);
    });
  });

  describe('Get job by id  - GET /api/jobs/:id', () => {
    const expectedJob = (opts: { status: string; name: string }) => {
      return {
        id: opts.status === 'started' ? opts.name + '.job' : [opts.status, opts.name].join('/') + '.job',
        name: opts.name,
        status: opts.status,
        inputFile: 'input',
        outputFile: 'output',
        script: 'test.sh',
      };
    };

    const jobData: JobData = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
    beforeEach(async () => {
      await createJob(jobDir, { jobId: 'test1.job', ...jobData });
      await createJob(jobDir, { jobId: 'todo/test2.job', ...jobData });
      await createJob(jobDir, { jobId: 'todo/test3.job', ...jobData });
      await createJob(jobDir, { jobId: 'done/test4.job', ...jobData });
      await createJob(jobDir, { jobId: 'error/test5.job', ...jobData });
    });

    it('should returns started job', async () => {
      const getJobResponse = await request.get('/api/jobs/test1.job');
      assertStatus(getJobResponse, 200);

      assert.deepEqual(getJobResponse.body, expectedJob({ name: 'test1', status: 'started' }));
    });

    it('should returns todo job', async () => {
      const getJobResponse = await request.get('/api/jobs/todo/test2.job');
      assertStatus(getJobResponse, 200);

      assert.deepEqual(getJobResponse.body, expectedJob({ name: 'test2', status: 'todo' }));
    });

    it('should returns done job', async () => {
      const getJobResponse = await request.get('/api/jobs/done/test4.job');
      assertStatus(getJobResponse, 200);

      assert.deepEqual(getJobResponse.body, expectedJob({ name: 'test4', status: 'done' }));
    });

    it('should returns job with status error', async () => {
      const getJobResponse = await request.get('/api/jobs/error/test5.job');
      assertStatus(getJobResponse, 200);

      assert.deepEqual(getJobResponse.body, expectedJob({ name: 'test5', status: 'error' }));
    });

    it('should returns 404 when job does not exists', async () => {
      const getJobResponse = await request.get('/api/jobs/error/unknown');
      assertStatus(getJobResponse, 404);
    });
  });

  describe('Create Job - POST /api/jobs', () => {
    it('should queue job with specified output and execute it', async () => {
      const createJobResponse = await request
        .post('/api/jobs/')
        .send({ inputFilePath: 'dir/input+3+0.1+0+.mp4', outFilePath: 'dir/output.mp4', scriptName: 'test.sh' });
      assertStatus(createJobResponse, 200);
      const createdJob = createJobResponse.body;
      assert.include(createdJob.name, '_dir');
      assert.deepEqual(createdJob.status, 'todo');
      assert.include(createdJob.id, '_dir.job');
      assert.deepEqual(createdJob.inputFile, 'dir/input+3+0.1+0+.mp4');
      assert.deepEqual(createdJob.outputFile, 'dir/output.mp4');
      assert.deepEqual(createdJob.script, 'test.sh');

      // Ensure job complete
      await eventually(async () => {
        const allJobsResponse = await request.get('/api/jobs');
        assertStatus(allJobsResponse, 200);
        assert.lengthOf(allJobsResponse.body, 1);
        assert.equal(allJobsResponse.body[0].status, 'done');
      }, 2000);
    });

    it('should create job with inferred output and execute it', async () => {
      const createJobResponse = await request
        .post('/api/jobs/')
        .send({ inputFilePath: 'dir/input+3+0.1+0+.mp4', scriptName: 'test.sh' });
      assertStatus(createJobResponse, 200);

      const createdJob = createJobResponse.body;
      assert.deepEqual(createdJob.inputFile, 'dir/input+3+0.1+0+.mp4');
      assert.deepEqual(createdJob.outputFile, 'dir/_input+3+0.1+0+.mp4');
      assert.deepEqual(createdJob.script, 'test.sh');

      // Ensure job complete
      await eventually(async () => {
        const allJobsResponse = await request.get('/api/jobs');
        assertStatus(allJobsResponse, 200);
        assert.lengthOf(allJobsResponse.body, 1);
        assert.equal(allJobsResponse.body[0].status, 'done');
      }, 2000);
    });

    it('should fail to create job when invalid script', async () => {
      const createJobResponse = await request
        .post('/api/jobs/')
        .send({ inputFilePath: 'input', scriptName: 'invalid.sh' });
      assertStatus(createJobResponse, 400);
    });

    it('should fail to create job when missing input', async () => {
      const createJobResponse = await request.post('/api/jobs/').send({ scriptName: 'tes.sh' });
      assertStatus(createJobResponse, 400);
    });
  });
});
