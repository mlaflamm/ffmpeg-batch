import 'reflect-metadata';

import path from 'path';
import fs from 'fs';
import touch from 'touch';
import supertest, { Response } from 'supertest';
import { assert } from 'chai';
import { Container } from 'typedi';

import { createAppFramework } from '../src/app';
import { Job, VideoFileInfo } from '../src/libs/job.model';
import { WatcherService } from '../src/libs/watcher.service';
import { JobsService } from '../src/libs/jobs.service';
import { Environment } from '../src/env';
import request from 'supertest';

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

export const getSampleVideoFile = async (type: 'mp4' | 'wmv' | 'mov'): Promise<string> => {
  switch (type) {
    case 'mp4': {
      const sampleFile = path.join('.temp', 'video_sample.mp4');
      await downloadSampleVideoIfRequired(
        sampleFile,
        'https://file-examples.com/wp-content/uploads/2017/04/file_example_MP4_480_1_5MG.mp4'
      );
      return sampleFile;
    }
    case 'wmv': {
      const sampleFile = path.join('.temp', 'video_sample.wmv');
      await downloadSampleVideoIfRequired(
        sampleFile,
        'https://file-examples.com/wp-content/uploads/2018/04/file_example_WMV_480_1_2MB.wmv'
      );
      return sampleFile;
    }
    case 'mov': {
      const sampleFile = path.join('.temp', 'video_sample.mov');
      await downloadSampleVideoIfRequired(
        sampleFile,
        'https://file-examples.com/wp-content/uploads/2018/04/file_example_MOV_480_700kB.mov'
      );
      return sampleFile;
    }
  }
};

const downloadSampleVideoIfRequired = async (outputFile: string, remoteUrl: string) => {
  await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
  return fs.promises.access(outputFile, fs.constants.F_OK).catch(() => {
    // File doesn't exist, download it
    const url = new URL(remoteUrl);
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputFile);
      stream
        .once('finish', () => {
          stream.close();
          resolve();
        })
        .once('error', err => {
          stream.close();
          reject(err);
        });
      request(url.origin)
        .get(url.pathname + '?' + url.search)
        .pipe(stream);
    });
  });
};

const testDir = '.test';

export const getFixtures = async function () {
  const container = Container.of(randomString());
  const framework = await createAppFramework('test', container);
  const app = framework.settings.getData('app');
  const env = container.get(Environment);

  const release = async () => {
    container.get(WatcherService).stop();
    container.get(JobsService).pause();
    Container.reset(container.id);

    await fs.promises.rmdir(testDir, { recursive: true });
  };

  return {
    env,
    request: supertest(app),
    release,
    testDir,
  };
};
