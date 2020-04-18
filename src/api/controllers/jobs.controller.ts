import { JsonController, Get, QueryParam } from 'routing-controllers';
import { JobsRepository } from '../../libs/jobs.repository';
import * as path from 'path';

type JobView = {
  name: string;
  status: string;
};

const StatusMapping: Partial<Record<string, string>> = {
  '.': 'started',
};

const toJobView = (jobId: string): JobView => {
  const name = path.basename(jobId).replace(/\.job$/g, '');
  const status = path.dirname(jobId);

  return {
    name,
    status: StatusMapping[status] || status,
  };
};

@JsonController('/v1/jobs')
export class JobsController {
  constructor(private readonly jobRepository: JobsRepository) {}

  @Get('/')
  public async getJobs(@QueryParam('status') status?: string) {
    const ids = await this.jobRepository.getAllJobIds();
    if (status) {
      return ids.map(toJobView).filter(id => id.status === status);
    }
    return ids.map(toJobView);
  }
}
