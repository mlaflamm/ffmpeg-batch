import namespace from 'debug';
import path from 'path';
import { ProcessRunner } from './utils/process-runner.js';

import { Job, JobData, VideoFileInfo } from './job.model.js';
import { JobsRepository } from './jobs.repository.js';
import { EventEmitter } from 'events';
import { extractVideoInfo } from './utils/ffprobe.js';
import fs from 'fs';

const debug = namespace('ffmpeg-batch:job.service');

export class JobsService {
  private stopped = false;
  private readonly operations = new Set<Promise<unknown>>();
  private readonly processes = new ProcessRunner();
  private paused: boolean = false;
  private readonly emitter: EventEmitter = new EventEmitter();
  private readonly scriptsDir: string;

  constructor(
    private readonly repository: JobsRepository,
    private readonly pollIntervalMs: number = 5 * 60 * 1000
  ) {
    this.scriptsDir = './scripts';
  }

  private async getVideoFileInfo(
    filePath: string,
    opts: { failIfFileMissing: boolean }
  ): Promise<VideoFileInfo | undefined> {
    const inputFileSize = await fs.promises
      .stat(filePath)
      .then(stat => (stat.isFile() ? stat.size : Promise.reject(new Error(`${filePath} is not a file!`))))
      .catch(err => (opts.failIfFileMissing ? Promise.reject(err) : undefined));
    const inputFileInfo = await extractVideoInfo(filePath, this.processes).catch(() => undefined);
    return inputFileInfo || inputFileSize ? { ...(inputFileInfo || {}), fileSize: inputFileSize } : undefined;
  }

  // queueJob
  queueJob(data: JobData): Promise<Job> {
    return this.track(this.queueJobImpl(data));
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.then(
      () => this.operations.delete(operation),
      () => this.operations.delete(operation)
    );
    return operation;
  }

  private async queueJobImpl(data: JobData): Promise<Job> {
    if (this.stopped) throw new Error('Jobs service stopped');
    // Don't duplicate job
    const pendingJobs = await this.repository.getIncompleteJobs();
    const foundJob = pendingJobs.find(
      job =>
        job.inputFilePath === data.inputFilePath &&
        job.outFilePath === data.outFilePath &&
        job.scriptName === data.scriptName
    );
    if (foundJob) {
      return foundJob;
    }

    const inputFileInfo = await this.getVideoFileInfo(data.inputFilePath, { failIfFileMissing: true });
    if (this.stopped) throw new Error('Jobs service stopped');
    const job = await this.repository.addJob(data, inputFileInfo);
    this.emitter.emit('job', job);
    return job;
  }

  // executeJob
  executeJob(job: Job): Promise<string | undefined> {
    return this.track(this.executeJobImpl(job));
  }

  private async executeJobImpl(job: Job): Promise<string | undefined> {
    if (this.stopped) return;
    const startedJob = await this.repository.startJob(job.jobId);
    if (!startedJob) {
      debug('Cannot execute job %s, not found!', job.jobId);
      return;
    }

    // Execute script
    const startTime = Date.now();
    const jobFilePath = this.repository.getJobPath(startedJob.jobId);
    const script = path.join(this.scriptsDir, startedJob.scriptName);
    if (this.stopped) return;
    try {
      await this.processes.run('/bin/bash', [script, startedJob.inputFilePath, startedJob.outFilePath], jobFilePath);
      if (this.stopped) return;
      const info = await this.getVideoFileInfo(startedJob.outFilePath, { failIfFileMissing: false });
      if (this.stopped) return;
      return await this.repository.completeJob(startedJob, startTime, info);
    } catch (err) {
      if (this.stopped) return;
      return this.repository.completeJob(startedJob, startTime, undefined, err as Error);
    }
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    this.resume();
    this.emitter.emit('job');
    await this.processes.close();
    await Promise.allSettled([...this.operations]);
  }

  public async getNextJob(): Promise<Job> {
    while (!this.stopped) {
      await this.pauseIfRequired();
      if (this.stopped) break;
      const job = await this.repository.getNextJob();
      if (job) {
        await this.pauseIfRequired();
        if (!this.stopped) return job;
        break;
      }
      await new Promise<void>(resolve => {
        const wake = () => {
          clearTimeout(timer);
          this.emitter.removeListener('job', wake);
          resolve();
        };
        const timer = setTimeout(wake, this.pollIntervalMs);
        this.emitter.once('job', wake);
        if (this.stopped) wake();
      });
    }
    throw new Error('Jobs service stopped');
  }

  // -----------------------------------------------------------------------------------------------
  // This next two methods are intended solely for tests and should not be used within application
  public async pause(): Promise<void> {
    if (this.paused) {
      return;
    }
    this.paused = true;
    await new Promise(resolve => this.emitter.once('pause', resolve));
    debug('Paused jobService');
  }
  public resume(): void {
    debug('Resuming jobService');
    this.paused = false;
    this.emitter.emit('resume');
  }

  private async pauseIfRequired(): Promise<void> {
    if (this.paused) {
      this.emitter.emit('pause');
      await new Promise(resolve => this.emitter.once('resume', resolve));
    }
  }
  // -----------------------------------------------------------------------------------------------
}
