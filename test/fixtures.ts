import 'reflect-metadata';

import path from 'path';
import fs from 'fs';
import touch from 'touch';
import supertest, { Response } from 'supertest';
import { assert } from 'chai';
import { Container } from 'typedi';

import { createAppFramework } from '../src/app';
import { Job } from '../src/libs/job.model';
import { WatcherService } from '../src/libs/watcher.service';
import { JobsService } from '../src/libs/jobs.service';
import { Environment } from '../src/env';

type UnwrapPromise<T extends Promise<any>> = T extends Promise<infer K> ? K : T;

export type Fixtures = UnwrapPromise<ReturnType<typeof getFixtures>>;

export const randomString = (): string => Math.random().toString(36).substring(7);

export const assertStatus = (response: Response, status: number, message?: string) => {
  assert.equal(response.status, status, JSON.stringify(response.body, null, 2));
  if (status >= 400 && message !== undefined) {
    assert.include(response.body.message, message);
  }
};

export const createJob = async (jobDir: string, job: Job, time: Date = new Date()) => {
  assert.isOk(jobDir.startsWith('.test/'), jobDir);

  const jobPath = path.join(jobDir, job.jobId);
  await fs.promises.writeFile(jobPath, JSON.stringify({ ...job, jobId: undefined }));
  await touch(jobPath, { time });
};

export const getFixtures = async function () {
  const container = Container.of(randomString());
  const framework = await createAppFramework('test', container);
  const app = framework.settings.getData('app');
  const env = container.get(Environment);

  const release = async () => {
    container.get(WatcherService).stop();
    container.get(JobsService).pause();
    Container.reset(container.id);

    await fs.promises.rmdir('.test', { recursive: true });
  };

  return {
    env,
    request: supertest(app),
    release,
  };
};
