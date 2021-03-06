import namespace from 'debug';
import prettyMs from 'pretty-ms';

import { ContainerInstance } from 'typedi';
import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';

import { Environment } from '../env';
import { JobsService } from '../libs/jobs.service';
import { WatcherService } from '../libs/watcher.service';
import { JobsRepository } from '../libs/jobs.repository';
import { pLoop } from '../libs/utils/promise-loop';

const debug = namespace('ffmpeg-batch:jobs.loader');

const processJobs = (jobService: JobsService) => {
  debug('awaiting next job to process');
  jobService
    .getNextJob()
    .then(job => {
      debug('found job to process: %s', job.jobId);
      return jobService
        .executeJob(job)
        .then(() => debug('completed processing job %s', job.jobId))
        .catch(err => debug('Error occurred while processing job %s: %s', job.jobId, err.message));
    })
    .then(() => void processJobs(jobService))
    .catch(err => {
      debug('Stopping service - error processing jobs: %s - %s ', err.message, err.stack);
      process.exit(1);
    });
};

export function jobsLoader(environment: Environment, container: ContainerInstance): MicroframeworkLoader {
  return async (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('Microframework did not provide settings');
    }

    const jobsRepository = new JobsRepository(environment.jobs.dir);
    const jobsService = new JobsService(jobsRepository, environment.jobs.pollIntervalMs);
    const watcherService = new WatcherService(jobsService, environment.watch.dir, environment.watch.defaultScript);

    container.set(JobsRepository, jobsRepository);
    container.set(JobsService, jobsService);
    container.set(WatcherService, watcherService);

    debug('watch enabled: %s', environment.watch.enabled);
    if (environment.watch.enabled) {
      watcherService.start(environment.watch.pollIntervalMs);
    }

    if (environment.jobs.cleanupIntervalMs > 0) {
      debug('jobs cleanup max age: %s', prettyMs(environment.jobs.cleanupMaxAgeMs));
      pLoop(() => jobsRepository.cleanupJobs(environment.jobs.cleanupMaxAgeMs), environment.jobs.cleanupIntervalMs);
    }

    debug('jobs enabled: %s', environment.jobs.enabled);
    if (!environment.jobs.enabled) {
      jobsService.pause();
    }
    processJobs(jobsService);
  };
}
