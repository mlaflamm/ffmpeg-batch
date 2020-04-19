import namespace from 'debug';
import path from 'path';
import util from 'util';
import child_process from 'child_process';

import { Service } from 'typedi';
import { Job, JobData } from './job.model';
import { JobsRepository } from './jobs.repository';
import { EventEmitter } from 'events';

const exec = util.promisify(child_process.exec);

const debug = namespace('ffmpeg-batch:job.service');

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

@Service()
export class JobsService {
  private paused: boolean = false;
  private readonly emitter: EventEmitter = new EventEmitter();
  private readonly scriptsDir: string;

  constructor(private readonly repository: JobsRepository, private readonly pollIntervalMs: number = 5 * 60 * 1000) {
    this.scriptsDir = './scripts';
  }

  // queueJob
  async queueJob(data: JobData): Promise<Job> {

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

    const job = await this.repository.addJob(data);
    this.emitter.emit('job', job);
    return job;
  }
  // executeJob
  async executeJob(job: Job): Promise<string | undefined> {
    const startedJob = await this.repository.startJob(job.jobId);
    if (!startedJob) {
      debug('Cannot execute job %s, not found!', job.jobId);
      return;
    }

    // Execute script
    const jobFilePath = this.repository.getJobPath(startedJob.jobId);
    const script = path.join(this.scriptsDir, startedJob.scriptName);
    const command = `${script} "${startedJob.inputFilePath}" "${startedJob.outFilePath}" >> "${jobFilePath}"`;
    debug(command);
    return exec(command)
      .then(() => this.repository.completeJob(startedJob.jobId))
      .catch(err => this.repository.completeJob(startedJob.jobId, err));
  }

  public async getNextJob(): Promise<Job> {
    await this.pauseIfRequired();
    const previousJob = await this.repository.getNextJob();
    if (previousJob) {
      await this.pauseIfRequired();
      return previousJob;
    }
    const status = { found: false };
    return Promise.race([
      new Promise<Job>(resolve =>
        this.emitter.once('job', job => {
          status.found = true;
          resolve(job);
        })
      ),
      this.pollNextJob(status),
    ]).then(async job => {
      await this.pauseIfRequired();
      return job;
    });
  }

  private async pollNextJob(status: { found: boolean }): Promise<Job> {
    let nextJob: Job | undefined = undefined;
    while (!nextJob && !status.found) {
      if (status.found) {
        break;
      }
      await this.pauseIfRequired();
      debug('polling for next available job');
      nextJob = await this.repository.getNextJob();
      if (!nextJob) {
        await sleep(this.pollIntervalMs);
      }
    }
    // Could be undefined but only a job had been found by creation in which case it will be ignored.
    // Safe to type as returning a job
    return nextJob as Job;
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
