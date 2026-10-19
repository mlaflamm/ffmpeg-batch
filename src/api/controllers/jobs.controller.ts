import * as path from 'path';
import pMap from 'p-map';
import prettyMs from 'pretty-ms';
import { filesize } from 'filesize';

import { Router } from 'express';
import { JobsRepository } from '../../libs/jobs.repository.js';
import { JobDetails, JobInputSchema, VideoFileInfo } from '../../libs/job.model.js';
import { JobsService } from '../../libs/jobs.service.js';
import { Environment } from '../../env.js';

type JobSummary = {
  id: string;
  name: string;
  status: string;
};

type JobView = JobSummary & {
  createdAt?: Date;
  startedAt?: Date;
  updatedAt?: Date;
  inputFile: string;
  outputFile: string;
  script: string;
  duration?: string;
  inputFileInfo?: FileInfoView;
  outputFileInfo?: FileInfoView;
};

type FileInfoView = Partial<{
  fileSize: string;
  codec_name: string;
  resolution: string;
  display_aspect_ratio: string;
  duration: string;
  bit_rate: string;
}>;

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
    id: jobId,
  };
};

const fileInfoToView = (info: VideoFileInfo): FileInfoView => {
  // TODO: Perform pretty format on the front end (e.g. file sizes, duration)
  return {
    codec_name: info.codec_name,
    resolution: info.width && info.width ? info.width + 'x' + info.height : undefined,
    // display_aspect_ratio: info.display_aspect_ratio,
    bit_rate: info.bit_rate && Math.floor(+info.bit_rate / 1000) + ' kb',
    duration: info.duration && prettyMs(1000 * Math.floor(+info.duration)),
    fileSize: info.fileSize ? filesize(info.fileSize, { base: 2, standard: 'jedec' }) : undefined,
  };
};

const jobToView = (job: JobDetails): JobView => {
  return {
    ...jobIdToSummary(job.jobId),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    inputFile: job.inputFilePath,
    outputFile: job.outFilePath,
    inputFileInfo: job.inputFileInfo && fileInfoToView(job.inputFileInfo),
    outputFileInfo: job.outputFileInfo && fileInfoToView(job.outputFileInfo),
    script: job.scriptName,
    duration: job.durationMs ? prettyMs(job.durationMs) : undefined, // TODO: format in front end
  };
};

export class JobsController {
  constructor(
    private readonly env: Environment,
    private readonly jobsService: JobsService,
    private readonly jobsRepository: JobsRepository
  ) {}

  public getJobById(id: string): Promise<JobView | undefined> {
    return this.jobsRepository.getJob(id).then(job => job && jobToView(job));
  }

  public getJobByStatusAndId(status: string, id: string): Promise<JobView | undefined> {
    return this.jobsRepository.getJob(path.join(status, id)).then(job => job && jobToView(job));
  }

  public async getJobs(status?: unknown) {
    const jobIds = status
      ? await this.jobsRepository.getAllJobIds().then(ids => ids.filter(id => jobIdtoStatus(id) === status))
      : await this.jobsRepository.getAllJobIds();

    if (!this.env.jobs.detailsList) {
      return jobIds
        .map(jobIdToSummary)
        .sort((a, b) => a.name.localeCompare(b.name))
        .reverse();
    }

    const jobs = await pMap(
      jobIds,
      id => this.jobsRepository.getJobDetails(id).then(details => details && jobToView(details)),
      { concurrency: 10 }
    );
    return jobs
      .filter(j => !!j)
      .sort((a, b) => (a?.updatedAt && b?.updatedAt ? a.updatedAt.getTime() - b.updatedAt.getTime() : 0))
      .reverse();
  }

  public createJob(body: unknown) {
    const jobInput = JobInputSchema.parse(body);

    // TODO: validate inputFilePath exists?
    // TODO: validate outFilePath directory exists?
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

export function jobsRouter(env: Environment, service: JobsService, repository: JobsRepository): Router {
  const router = Router();
  const controller = new JobsController(env, service, repository);
  router.get('/', async (req, res) => {
    const status = req.query.status;
    res.json(await controller.getJobs(status));
  });
  router.get('/:status/:id', async (req, res) => {
    const job = await controller.getJobByStatusAndId(req.params.status, req.params.id);
    if (job === undefined) res.status(404).end();
    else res.json(job);
  });
  router.get('/:id', async (req, res) => {
    const job = await controller.getJobById(req.params.id);
    if (job === undefined) res.status(404).end();
    else res.json(job);
  });
  router.post('/', async (req, res) => res.json(await controller.createJob(req.body === undefined ? {} : req.body)));
  return router;
}
