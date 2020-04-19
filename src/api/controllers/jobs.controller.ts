import { JsonController, Get, QueryParam, Post, Body, Param, OnUndefined } from 'routing-controllers';
import { JobsRepository } from '../../libs/jobs.repository';
import * as path from 'path';
import { Job, JobInputSchema } from '../../libs/job.model';
import { JobsService } from '../../libs/jobs.service';

type JobSummary = {
  name: string;
  status: string;
};

type JobView = Job & JobSummary;

const StatusMapping: Partial<Record<string, string>> = {
  '.': 'started',
};

const jobIdToSummary = (jobId: string): JobSummary => {
  const name = path.basename(jobId).replace(/\.job$/g, '');
  const status = path.dirname(jobId);

  return {
    name,
    status: StatusMapping[status] || status,
  };
};

const jobToView = (job: Job): JobView => {
  return { ...jobIdToSummary(job.jobId), ...job };
};

@JsonController('/api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService, private readonly jobsRepository: JobsRepository) {}

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
    const summaries = (await this.jobsRepository.getAllJobIds())
      .map(jobIdToSummary)
      .sort((a, b) => a.name.localeCompare(b.name))
      .reverse();
    return status ? summaries.filter(id => id.status === status) : summaries;
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
