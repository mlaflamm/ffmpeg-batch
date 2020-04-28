import namespace from 'debug';
import SocketIO from 'socket.io';
import path from 'path';

import { Application } from 'express';
import { ContainerInstance } from 'typedi';
import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';

import { Environment } from '../env';
import { JobsRepository } from '../libs/jobs.repository';

const sliceFile = require('slice-file-ml');

const debug = namespace('ffmpeg-batch:websocket.loader');

export function websocketLoader(env: Environment, container: ContainerInstance): MicroframeworkLoader {
  return (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('Bootstrap Microframework did not provide settings');
    }

    const app: Application = settings.getData('app');

    app.get('/jobs/todo/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
    app.get('/jobs/done/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
    app.get('/jobs/error/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
    app.get('/jobs/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));

    const jobsRepository = container.get(JobsRepository);

    const openStreams: Record<string, { close: () => void }> = {};

    const server = settings.getData('server');
    const io = SocketIO(server);
    io.on('connection', socket => {
      const socketId = socket.id;
      debug(`client connected (${socketId})`);

      socket.on('tail', data => {
        const jobId = decodeURI(data).replace('/jobs/', '');
        const jobPath = jobsRepository.getJobPath(jobId);

        debug('start tailing (%s) -> "%s"', socketId, jobId);
        const streams = sliceFile(jobPath).on('error', (err: Error) => {
          debug('stream error %s: %s', jobId, err.message);
        });
        openStreams[socketId] = streams;
        streams
          .follow(0)
          .on('error', (err: Error) => {
            debug('tailing error %s: %s', jobId, err.message);
          })
          .on('data', (data: Buffer) => {
            io.to(socketId).emit('newLine', {
              line: data.toString(),
            });
          });
      });

      socket.on('disconnect', () => {
        debug(`client disconnected (${socketId})`);
        const stream = openStreams[socketId];
        delete openStreams[socketId];
        if (stream) {
          stream.close();
        }
      });
    });
  };
}
