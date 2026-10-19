import express, { ErrorRequestHandler } from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import { ValidationError } from 'myzod';
import { Environment } from './env.js';
import { JobsRepository } from './libs/jobs.repository.js';
import { JobsService } from './libs/jobs.service.js';
import { WatcherService } from './libs/watcher.service.js';
import { pLoop } from './libs/utils/promise-loop.js';
import { jobsRouter } from './api/controllers/jobs.controller.js';
import { attachWebui } from './loaders/webui.loader.js';
import { attachWebsocket } from './loaders/websocket.loader.js';

export async function createApplication(environment: string) {
  const env = new Environment(environment);
  const app = express();
  const server = http.createServer(app);
  const repository = new JobsRepository(env.jobs.dir);
  const jobs = new JobsService(repository, env.jobs.pollIntervalMs);
  const watcher = new WatcherService(jobs, env.watch.dir, env.watch.defaultScript);
  let stopCleanup: (() => Promise<void>) | undefined;
  let closeSocket: (() => Promise<void>) | undefined;
  let worker: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let stopping = false;

  const close = (): Promise<void> => {
    if (closing) return closing;
    stopping = true;
    // Stop admission before awaiting any cleanup. Socket.IO closes upgraded connections too.
    server.close();
    server.closeAllConnections();
    closing = Promise.allSettled([jobs.stop(), watcher.stop(), stopCleanup?.(), closeSocket?.()]).then(
      async results => {
        await worker;
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
    );
    return closing;
  };

  try {
    if (env.nodeEnv !== 'test') app.use(morgan('dev'));
    app.use(express.json());
    app.set('query parser', 'extended');
    attachWebui(app);
    app.use(cors());
    app.use('/api/jobs', jobsRouter(env, jobs, repository));
    closeSocket = attachWebsocket(app, server, repository);
    const errors: ErrorRequestHandler = (err, _req, res, _next) => {
      res.status(err instanceof ValidationError ? 400 : err.statusCode || 500).json({ message: err.message });
    };
    app.use(errors);
    if (env.watch.enabled) watcher.start(env.watch.pollIntervalMs);
    if (env.jobs.cleanupIntervalMs > 0) {
      stopCleanup = pLoop(() => repository.cleanupJobs(env.jobs.cleanupMaxAgeMs), env.jobs.cleanupIntervalMs);
    }
    if (!env.jobs.enabled) void jobs.pause();
    worker = (async () => {
      while (!stopping) {
        try {
          const job = await jobs.getNextJob();
          if (!stopping) await jobs.executeJob(job);
        } catch (err) {
          if (!stopping) {
            console.error('Job processing stopped:', err);
            process.exitCode = 1;
            // Do not await our own worker during cleanup.
            void close();
          }
        }
      }
    })();
    return { app, server, env, jobs, repository, close };
  } catch (err) {
    await close();
    throw err;
  }
}
