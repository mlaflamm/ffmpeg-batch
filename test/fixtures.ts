import path from 'path';
import fs from 'fs';
import touch from 'touch';
import supertest, { Response } from 'supertest';
import { assert } from 'chai';

import { createApplication } from '../src/app.js';
import { Job, VideoFileInfo } from '../src/libs/job.model.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

type UnwrapPromise<T extends Promise<any>> = T extends Promise<infer K> ? K : T;

export type Fixtures = UnwrapPromise<ReturnType<typeof getFixtures>>;

export const randomString = (): string => Math.random().toString(36).substring(7);

export const assertStatus = (response: Response, status: number, message?: string) => {
  assert.equal(response.status, status, JSON.stringify(response.body, null, 2));
  if (status >= 400 && message !== undefined) {
    assert.include(response.body.message, message);
  }
};

export const createJob = async (
  jobDir: string,
  job: Job,
  opts: { inputFileInfo?: VideoFileInfo; time?: Date } = {}
) => {
  assert.isOk(jobDir.startsWith('.test/'), jobDir);

  const jobPath = path.join(jobDir, job.jobId);
  await fs.promises.writeFile(jobPath, JSON.stringify({ ...job, jobId: undefined, ...(opts.inputFileInfo || {}) }));
  await touch(jobPath, { time: opts.time || new Date() });
  return job;
};

const execFileAsync = promisify(execFile);

// Generate short, known media locally so tests do not require network access.
// Cache promises so concurrent callers cannot read a partially written fixture.
const sampleVideos = new Map<string, Promise<string>>();
export const getSampleVideoFile = (type: 'mp4' | 'wmv' | 'mov' | 'av1'): Promise<string> => {
  const existing = sampleVideos.get(type);
  if (existing) {
    return existing;
  }
  const generate = async () => {
    const outputFile = path.join('.temp', `generated_sample_${type}.${type === 'av1' ? 'mp4' : type}`);
    await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
    const videoArgs =
      type === 'av1'
        ? ['-c:v', 'libaom-av1', '-cpu-used', '8', '-crf', '40']
        : type === 'wmv'
          ? ['-c:v', 'wmv2']
          : ['-c:v', 'libx264', '-crf', '21'];
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=480x270:rate=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '2',
      ...videoArgs,
      '-threads',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      type === 'wmv' ? 'wmav2' : 'aac',
      '-metadata',
      'title=fixture-title',
      outputFile,
    ]);
    return outputFile;
  };
  const result = generate();
  sampleVideos.set(type, result);
  return result;
};

const testDir = '.test';

export const getFixtures = async function () {
  const application = await createApplication('test');
  const { app, env } = application;
  const release = async () => {
    await application.close();
    await fs.promises.rm(testDir, { recursive: true, force: true });
  };

  return {
    env,
    request: supertest(app),
    release,
    testDir,
  };
};
