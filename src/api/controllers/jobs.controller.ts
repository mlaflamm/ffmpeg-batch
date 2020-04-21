import * as path from 'path';
import prettyMs from 'pretty-ms';
import filesize from 'filesize';

import { JsonController, Get, QueryParam, Post, Body, Param, OnUndefined } from 'routing-controllers';
import { JobsRepository } from '../../libs/jobs.repository';
import { Job, JobDetails, JobInputSchema } from '../../libs/job.model';
import { JobsService } from '../../libs/jobs.service';
import { Environment } from '../../env';

type JobSummary = {
  name: string;
  status: string;
};

type JobView = Job & JobSummary;
type JobDetailsView = JobDetails & JobSummary & { duration?: string };

const StatusMapping: Partial<Record<string, string>> = {
  '.': 'started',
};

const jobIdtoStatus = (jobId: string): string => {
  const status = path.dirname(jobId);
  return StatusMapping[status] || status;
};

const jobIdToSummary = (jobId: string): JobSummary => {
  return {
    name: path.basename(jobId).replace(/\.job$/g, ''),
    status: jobIdtoStatus(jobId),
  };
};

const jobToView = (job: Job): JobView => {
  return { ...jobIdToSummary(job.jobId), ...job };
};

const jobDetailsToView = (job: JobDetails): JobDetailsView => {
  // TODO: Cleanup types and conversions
  return {
    ...jobIdToSummary(job.jobId),
    createdAt: undefined,
    startedAt: undefined,
    updatedAt: undefined,
    ...job,
    inputFileSize: job.inputFileSize ? filesize(job.inputFileSize) : undefined,
    outputFileSize: job.outputFileSize ? filesize(job.outputFileSize): undefined,
    duration: job.durationMs ? prettyMs(job.durationMs) : undefined,
    durationMs: undefined,
  } as any;
};

@JsonController('/api/jobs')
export class JobsController {
  constructor(
    private readonly env: Environment,
    private readonly jobsService: JobsService,
    private readonly jobsRepository: JobsRepository
  ) {}

  @OnUndefined(404)
  @Get('/:id')
  public getJobById(@Param('id') id: string): Promise<JobView | undefined> {
    return this.jobsRepository.getJob(id).then(job => job && jobToView(job));
  }

  @OnUndefined(404)
  @Get('/:status/:id')
  public getJobByStatusAndId(@Param('status') status: string, @Param('id') id: string): Promise<JobView | undefined> {
    return this.jobsRepository.getJob(path.join(status, id)).then(job => job && jobToView(job));
  }

  @Get('/')
  public async getJobs(@QueryParam('status') status?: string) {
    const allJobIds = status
      ? await this.jobsRepository.getAllJobIds().then(ids => ids.filter(id => jobIdtoStatus(id) === status))
      : await this.jobsRepository.getAllJobIds();
    if (this.env.jobs.detailsList) {
      // TODO: Use p-map instead to reduce fs concurrency!!!
      const jobs = await Promise.all(
        allJobIds.map(id => this.jobsRepository.getJobDetails(id).then(details => details && jobDetailsToView(details)))
      );
      return jobs
        .filter(j => !!j)
        .sort((a, b) => (a && b ? a.name.localeCompare(b.name) : 0))
        .reverse();
    }

    return allJobIds
      .map(jobIdToSummary)
      .sort((a, b) => a.name.localeCompare(b.name))
      .reverse();
  }

  @Post('/')
  public createJob(@Body() body: unknown) {
    const jobInput = JobInputSchema.parse(body);

    // TODO: validate inputFilePath?
    // TODO: validate outFilePath directory?
    const outFilePath =
      jobInput.outFilePath ||
      (() => {
        const ext = path.extname(jobInput.inputFilePath);
        const baseName = path.basename(jobInput.inputFilePath).slice(0, -ext.length) + '.mp4';
        return path.join(path.dirname(jobInput.inputFilePath), '_' + baseName);
      })();
    return this.jobsService
      .queueJob({
        inputFilePath: jobInput.inputFilePath,
        outFilePath,
        scriptName: jobInput.scriptName,
      })
      .then(job => job && jobToView(job));
  }
}
