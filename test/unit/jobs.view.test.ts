import { assert } from 'chai';
import fs from 'fs';
import prettyMs from 'pretty-ms';
import pMap from 'p-map';
import nodeAssert from 'assert';
import { Environment } from '../../src/env.js';
import { JobsController } from '../../src/api/controllers/jobs.controller.js';
import { JobsRepository } from '../../src/libs/jobs.repository.js';
import { JobsService } from '../../src/libs/jobs.service.js';

describe('Job display contracts', () => {
  const dir = '.test/views';
  after(() => fs.promises.rm(dir, { recursive: true, force: true }));

  it('preserves binary filesize units, resolution, bitrate and duration formatting', async () => {
    const repository = new JobsRepository(dir);
    const service = new JobsService(repository);
    const controller = new JobsController(new Environment('test'), service, repository);
    try {
      for (const [fileSize, expected] of [
        [1000, '1000 B'],
        [1024, '1 KB'],
        [1536, '1.5 KB'],
        [1000000, '976.56 KB'],
        [1073741824, '1 GB'],
      ] as const) {
        const job = await repository.addJob(
          { inputFilePath: 'input', outFilePath: 'output', scriptName: 'scale.sh' },
          {
            fileSize,
            codec_name: 'h264',
            width: 480,
            height: 270,
            bit_rate: '250000',
            duration: '60.9',
          }
        );
        const view = await controller.getJobByStatusAndId('todo', job.jobId.split('/').pop()!);
        assert.deepEqual(view?.inputFileInfo, {
          codec_name: 'h264',
          resolution: '480x270',
          bit_rate: '250 kb',
          duration: '1m',
          fileSize: expected,
        });
      }
      assert.deepEqual(
        [0, 1, 999, 1000, 60001, 3600000, 86400000].map(value => prettyMs(value)),
        ['0ms', '1ms', '999ms', '1s', '1m', '1h', '1d']
      );
    } finally {
      await service.stop();
    }
  });

  it('preserves concurrency bounds, input ordering and mapping errors', async () => {
    let active = 0;
    let peak = 0;
    const result = await pMap(
      [3, 2, 1, 0],
      async value => {
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, value * 5));
        active--;
        return value * 2;
      },
      { concurrency: 2 }
    );
    assert.deepEqual(result, [6, 4, 2, 0]);
    assert.equal(peak, 2);
    await nodeAssert.rejects(
      pMap([1], async () => {
        throw new Error('mapping failed');
      }),
      /mapping failed/
    );
  });
});
