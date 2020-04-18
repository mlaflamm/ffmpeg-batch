import { assert } from 'chai';
import { SuperTest, Test } from 'supertest';

import { getFixtures, Fixtures, assertStatus, createJob } from '../fixtures';
import { JobData } from '../../src/libs/jobs.repository';

describe('Jobs api routes', () => {
  let fixtures: Fixtures;
  let request: SuperTest<Test>;
  let jobDir: string;

  before(async () => {
    fixtures = await getFixtures();
    request = fixtures.request;
    jobDir = fixtures.env.jobs.dir;
  });

  // beforeEach(() => fixtures.clearDatabase());

  after(() => fixtures.release());

  describe('Get All Jobs - GET /api/jobs', () => {
    const jobData: JobData = { inputFilePath: 'input', outFilePath: 'output', scriptName: 'test.sh' };
    before(async () => {
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
        { name: 'test1', status: 'started' },
        { name: 'test2', status: 'todo' },
        { name: 'test3', status: 'todo' },
        { name: 'test4', status: 'done' },
        { name: 'test5', status: 'error' },
      ]);
    });

    it('should returns started jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=started');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ name: 'test1', status: 'started' }]);
    });

    it('should returns todo jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=todo');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [
        { name: 'test2', status: 'todo' },
        { name: 'test3', status: 'todo' },
      ]);
    });

    it('should returns done jobs', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=done');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ name: 'test4', status: 'done' }]);
    });

    it('should returns jobs with status error', async () => {
      const allJobsResponse = await request.get('/api/jobs?status=error');
      assertStatus(allJobsResponse, 200);

      assert.deepEqual(allJobsResponse.body, [{ name: 'test5', status: 'error' }]);
    });
  });
});
