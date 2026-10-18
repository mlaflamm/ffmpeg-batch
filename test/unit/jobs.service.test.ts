import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { extractVideoInfo } from '../../src/libs/utils/ffprobe';

import { assert } from 'chai';
import nodeAssert from 'assert';

import { JobsService } from '../../src/libs/jobs.service';
import { JobsRepository } from '../../src/libs/jobs.repository';
import { getSampleVideoFile, randomString } from '../fixtures';
import { readLastLine } from '../../src/libs/utils/read-last-line';

describe('Job service', () => {
  const testDir = path.join('.test', randomString());

  beforeEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.promises.rm('.test', { recursive: true, force: true });
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
    it('should convert AV1 input through scale.sh and copy audio without retaining the title', async function () {
      this.timeout(15000);
      const execFileAsync = promisify(execFile);
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);
      const inputFilePath = await getSampleVideoFile('av1');
      const outFilePath = path.join(testDir, 'scaled output.mp4');
      const job = await service.queueJob({ inputFilePath, outFilePath, scriptName: 'scale.sh' });
      assert.include(job.inputFileInfo, { codec_name: 'av1', width: 480, height: 270 });

      const doneJobId = await service.executeJob(job);
      assert.match(doneJobId!, /^done\//);
      const result = await repository.getJobResult(doneJobId!);
      assert.include(result!.outputFileInfo, { codec_name: 'h264', width: 960, height: 540 });
      assert.closeTo(Number((await extractVideoInfo(outFilePath)).duration), 2, 0.1);
      await execFileAsync('ffmpeg', ['-v', 'error', '-xerror', '-i', outFilePath, '-f', 'null', '-']);

      const probe = async (file: string) => {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          file,
        ]);
        return JSON.parse(stdout);
      };
      const input = await probe(inputFilePath);
      const output = await probe(outFilePath);
      assert.equal(input.format.tags.title, 'fixture-title');
      assert.isUndefined(output.format.tags.title);
      assert.include(output.streams[0], { pix_fmt: 'yuv420p', display_aspect_ratio: '16:9' });
      assert.include(output.streams[1], { codec_name: 'aac', channels: 1, sample_rate: '48000' });
      // Packet hashes verify the script copies audio without re-encoding.
      const audioHash = async (file: string) =>
        (
          await execFileAsync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-'])
        ).stdout.trim();
      assert.equal(await audioHash(outFilePath), await audioHash(inputFilePath));
    });

    it('should restart a stalled conversion and overwrite partial output', async function () {
      this.timeout(15000);
      const repository = new JobsRepository(testDir);
      const service = new JobsService(repository);
      const inputFilePath = await getSampleVideoFile('av1');
      const outFilePath = path.join(testDir, 'interrupted.mp4');
      const job = await service.queueJob({ inputFilePath, outFilePath, scriptName: 'scale.sh' });
      const started = await repository.startJob(job.jobId);
      assert.isOk(started);
      await fs.promises.writeFile(outFilePath, 'incomplete MP4 from interrupted conversion');
      const staleTime = new Date(Date.now() - 61000);
      await fs.promises.utimes(repository.getJobPath(started!.jobId), staleTime, staleTime);

      // Recreate the service and repository as a restarted process would.
      const restartedService = new JobsService(new JobsRepository(testDir));
      const recovered = await restartedService.getNextJob();
      assert.equal(recovered.jobId, started!.jobId);
      const doneJobId = await restartedService.executeJob(recovered);
      assert.match(doneJobId!, /^done\//);
      const info = await extractVideoInfo(outFilePath);
      assert.include(info, { codec_name: 'h264', width: 960, height: 540 });
      assert.closeTo(Number(info.duration), 2, 0.1);
      await promisify(execFile)('ffmpeg', ['-v', 'error', '-xerror', '-i', outFilePath, '-f', 'null', '-']);
    });

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
