import namespace from 'debug';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { Service } from 'typedi';

const debug = namespace('ffmpeg-batch:job.repository');

export type Job = { jobId: string } & JobData;

export type JobData = {
  inputFilePath: string;
  outFilePath: string;
  scriptName: string;
};

async function readFirstLine(pathToFile: string): Promise<string> {
  const readable = fs.createReadStream(pathToFile);
  const reader = readline.createInterface({ input: readable });
  const line = await new Promise<string>((resolve, reject) => {
    const onError = (err: Error) => {
      reader.close();
      readable.destroy();
      reject(err);
    };
    readable.once('error', onError);
    reader
      .once('line', (line: string) => {
        reader.close();
        readable.close();
        resolve(line);
      })
      .once('error', onError);
  });
  return line;
}

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
        debug('Got error when reading job: %s', jobId, err);
      });
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
  async completeJob(jobId: string, err?: Error): Promise<string> {
    const runningJobFilePath = path.join(this.jobsDir, path.basename(jobId));

    if (err) {
      // error, move job file to error directory
      debug('Error running "%s"', path.basename(jobId), err);
      const errorJobFilePath = path.join(this.errorDir, path.basename(jobId));
      await fs.promises.rename(runningJobFilePath, errorJobFilePath);
      return path.join('error', path.basename(jobId));
    }

    // done, move job file to done directory
    debug('Done running "%s"', path.basename(jobId));
    const doneJobFilePath = path.join(this.doneDir, path.basename(jobId));
    await fs.promises.rename(runningJobFilePath, doneJobFilePath);
    return path.join('done', path.basename(jobId));
  }

  // getStartedJobIds
  private async getStartedJobIds(): Promise<string[]> {
    return await fs.promises
      .readdir(this.jobsDir, { withFileTypes: true })
      .then(entries =>
        entries.map(entry => (!entry.isDirectory() && entry.name.endsWith('.job') ? entry.name : '')).sort()
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

    const todoJobs = await fs.promises.readdir(this.todoDir).then(children => children.sort());
    if (todoJobs.length > 0) {
      const jobId = path.join('todo', todoJobs[0]);
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
}
