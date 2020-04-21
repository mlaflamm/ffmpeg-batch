import namespace from 'debug';
import fs from 'fs';
import path from 'path';
import prettyMs from 'pretty-ms';

import { Service } from 'typedi';
import { Job, JobData, JobDetails, JobResult } from './job.model';
import { readFirstLine, readLastLine } from './utils/read-line';

const debug = namespace('ffmpeg-batch:job.repository');

@Service()
export class JobsRepository {
  private readonly todoDir: string;
  private readonly errorDir: string;
  private readonly doneDir: string;

  constructor(private readonly jobsDir: string) {
    this.todoDir = path.join(jobsDir, 'todo');
    this.errorDir = path.join(jobsDir, 'error');
    this.doneDir = path.join(jobsDir, 'done');
    // this.progressDir = path.join(jobsDir, 'progress');
    fs.mkdirSync(this.todoDir, { recursive: true });
    fs.mkdirSync(this.doneDir, { recursive: true });
    fs.mkdirSync(this.errorDir, { recursive: true });
  }

  // getJobPath
  getJobPath(jobId: string): string {
    return path.join(this.jobsDir, jobId);
  }

  // getJob
  async getJob(jobId: string): Promise<Job | undefined> {
    return await readFirstLine(this.getJobPath(jobId))
      .then(line => ({ jobId, ...JSON.parse(line) }))
      .catch(err => {
        debug('Got error when reading job: "%s"', jobId, err);
      });
  }

  // getJobResult
  async getJobResult(jobId: string): Promise<JobResult | undefined> {
    if (jobId.startsWith('done/') || jobId.startsWith('error/')) {
      return await readLastLine(this.getJobPath(jobId))
        .then(line => JSON.parse(line))
        .catch(err => undefined);
    }
  }

  // getJobDetails
  async getJobDetails(jobId: string): Promise<JobDetails | undefined> {
    const [jobIdPrefix] = path.basename(jobId).split('_');
    const createdAt = /^1[0-9]{12}$/.test(jobIdPrefix) ? new Date(+jobIdPrefix) : undefined;

    const [job, result, stat] = await Promise.all([
      this.getJob(jobId),
      this.getJobResult(jobId),
      fs.promises.stat(this.getJobPath(jobId)).catch(err => undefined),
    ]);

    if (job) {
      return { createdAt, updatedAt: stat?.mtime, ...job, ...(result || {}) };
    }
  }

  // addJob
  async addJob(job: JobData): Promise<Job> {
    const jobId = path.join(
      'todo',
      new Date().getTime() + '_' + path.basename(path.dirname(job.inputFilePath)) + '.job'
    );
    await fs.promises.writeFile(path.join(this.jobsDir, jobId), JSON.stringify(job));
    return { jobId, ...job };
  }

  // startJob
  async startJob(jobId: string): Promise<Job | undefined> {
    // Load job details
    debug('start job - Loading job details "%s"', jobId);
    const jobData = await this.getJob(jobId);
    if (!jobData) {
      debug('start job - job %s not found!', jobId);
      return;
    }

    const sourceJobFilePath = path.join(this.jobsDir, jobId);
    const runningJobFilePath = path.join(this.jobsDir, path.basename(jobId));

    // Touch and move job file
    debug('start job - touch %s', sourceJobFilePath);
    if (fs.existsSync(sourceJobFilePath)) {
      // Use sync API to ensure atomicity (assuming single process here!)
      await fs.appendFileSync(sourceJobFilePath, '\n\n');
      if (sourceJobFilePath !== runningJobFilePath) {
        // Move job file to in progress directory
        debug('start job - move %s -> %s', sourceJobFilePath, runningJobFilePath);
        await fs.renameSync(sourceJobFilePath, runningJobFilePath);
      }

      return { ...jobData, jobId: path.basename(jobId) };
    }
    return;
  }

  // completeJob
  async completeJob(job: Job, jobStartTime: number, err?: Error): Promise<string> {
    const jobId = job.jobId;
    const runningJobFilePath = path.join(this.jobsDir, path.basename(jobId));
    const durationMs = Date.now() - jobStartTime;
    const [inputFileSize, outputFileSize] = await Promise.all([
      fs.promises
        .stat(job.inputFilePath)
        .then(stat => stat.size)
        .catch(err => undefined),
      fs.promises
        .stat(job.outFilePath)
        .then(stat => stat.size)
        .catch(err => undefined),
    ]);
    const resultLine = JSON.stringify({ startedAt: new Date(jobStartTime), durationMs, inputFileSize, outputFileSize });

    if (err) {
      // job failure, move job file to error directory
      debug('Job failure (%s) "%s": %s', prettyMs(durationMs), path.basename(jobId), err.message);
      await fs.promises.appendFile(runningJobFilePath, '\n' + resultLine);

      const errorJobFilePath = path.join(this.errorDir, path.basename(jobId));
      await fs.promises.rename(runningJobFilePath, errorJobFilePath);
      return path.join('error', path.basename(jobId));
    }

    // job completed, move job file to done directory
    debug('Job completed (%s) "%s"', prettyMs(durationMs), path.basename(jobId));
    await fs.promises.appendFile(runningJobFilePath, '\n' + resultLine);

    const doneJobFilePath = path.join(this.doneDir, path.basename(jobId));
    await fs.promises.rename(runningJobFilePath, doneJobFilePath);
    return path.join('done', path.basename(jobId));
  }

  // getStartedJobIds
  private async getStartedJobIds(): Promise<string[]> {
    return await fs.promises.readdir(this.jobsDir, { withFileTypes: true }).then(entries =>
      entries
        .map(entry => (!entry.isDirectory() && entry.name.endsWith('.job') ? entry.name : ''))
        .filter(name => !!name)
        .sort()
    );
  }

  // getStalledJobIds
  private async getStalledJobIds(): Promise<string[]> {
    const startedJobs = await this.getStartedJobIds();
    const stalledJobs = (
      await Promise.all(
        startedJobs.map(name => {
          if (!name) {
            return '';
          }
          return fs.promises
            .stat(path.join(this.jobsDir, name))
            .then(stat => (Date.now() - stat.mtimeMs > 60000 ? name : ''));
        })
      )
    ).filter(name => !!name);
    return stalledJobs;
  }

  // getJobIdsByStatus
  private async getJobIdsByStatus(status: 'todo' | 'done' | 'error'): Promise<string[]> {
    const names = await fs.promises.readdir(path.join(this.jobsDir, status));
    return names.map(name => path.join(status, name));
  }

  // getAllJobIds
  async getAllJobIds(): Promise<string[]> {
    return [
      ...(await this.getStartedJobIds()),
      ...(await this.getJobIdsByStatus('todo')),
      ...(await this.getJobIdsByStatus('done')),
      ...(await this.getJobIdsByStatus('error')),
    ];
  }

  // nextJob
  async getNextJob(): Promise<Job | undefined> {
    debug('Finding next job');

    // find first started inactive job
    const stalledJobs = await this.getStalledJobIds();
    if (stalledJobs.length > 0) {
      const jobId = stalledJobs[0];
      debug('Found stalled job to resume "%s"', jobId);
      return this.getJob(jobId);
    }

    const [jobId] = await this.getJobIdsByStatus('todo').then(children => children.sort());
    if (jobId) {
      debug('Found job to run "%s"', jobId);
      return this.getJob(jobId);
    }
  }

  // getIncompleteJobs
  async getIncompleteJobs(): Promise<Job[]> {
    const startedJobs = await this.getStartedJobIds();
    const todoJobs = await fs.promises
      .readdir(this.todoDir)
      .then(children => children.sort().map(id => path.join('todo', id)));

    const jobs: Job[] = [];
    for (const jobId of [...startedJobs, ...todoJobs]) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  // cleanupJobs
  async cleanupJobs(maxAgeMs: number): Promise<number> {
    debug('Cleaning up completed jobs older than %s', prettyMs(maxAgeMs));

    const now = Date.now();
    const completedJobIds = await this.getJobIdsByStatus('done');
    const cleanupJobs = completedJobIds
      .map(id => this.getJobPath(id))
      .map(async jobPath => {
        const stat = await fs.promises.stat(jobPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          return fs.promises
            .unlink(jobPath)
            .then(() => 1)
            .catch(err => {
              debug('Error cleaning up job "%s": %s', jobPath, err.message);
              return 0;
            });
        } else {
          return Promise.resolve(0);
        }
      });

    const count = await Promise.all(cleanupJobs).then(results => results.reduce((total, result) => total + result, 0));
    debug('Removed %d completed jobs', count);
    return count;
  }
}
