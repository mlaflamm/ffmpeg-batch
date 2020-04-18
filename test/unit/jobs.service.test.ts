import fs from 'fs';
import path from 'path';

import { assert } from 'chai';

import { JobsService } from '../../src/libs/jobs.service';
import { JobsRepository } from '../../src/libs/jobs.repository';
import { randomString } from '../fixtures';

describe('Job service', () => {
  const testDir = path.join('.test', randomString());

  beforeEach(async () => {
    await fs.promises.rmdir(testDir, { recursive: true });
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.promises.rmdir('.test', { recursive: true });
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
      assert.isNotOk(fs.existsSync(path.join(testDir, job.jobId)));
      assert.isOk(fs.existsSync(path.join(testDir, doneJobId)));
      const jobData = await fs.promises.readFile(path.join(testDir, doneJobId), { encoding: 'utf8' });

      const expected = `{"inputFilePath":"+5+0.2+0+","outFilePath":"some % dir/some % file","scriptName":"test.sh"}

+5+0.2+0+
some %% dir/some %% file
0
1
2
3
4
`;
      assert.equal(jobData, expected);
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
      assert.isNotOk(await fs.existsSync(path.join(testDir, job.jobId)));
      assert.isOk(await fs.existsSync(path.join(testDir, errorJobId)));
    });
  });
});
