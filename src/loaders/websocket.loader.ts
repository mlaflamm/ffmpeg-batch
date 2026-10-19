import namespace from 'debug';
import { Server as SocketServer } from 'socket.io';
import path from 'path';

import { Application } from 'express';
import { Server } from 'http';

import { JobsRepository } from '../libs/jobs.repository.js';

import { createRequire } from 'node:module';
const sliceFile = createRequire(import.meta.url)('slice-file-ml');

const debug = namespace('ffmpeg-batch:websocket.loader');

export function attachWebsocket(app: Application, server: Server, jobsRepository: JobsRepository): () => Promise<void> {
  app.get('/jobs/todo/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
  app.get('/jobs/done/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
  app.get('/jobs/error/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
  app.get('/jobs/:id', (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));

  const openStreams: Record<string, { close: () => Promise<void> }> = {};

  // https://stackoverflow.com/questions/46219867/nodejs-spawn-remote-tail-and-socket-io-to-client

  const io = new SocketServer(server);
  io.on('connection', socket => {
    const socketId = socket.id;
    debug(`client connected (${socketId})`);

    socket.on('tail', data => {
      if (typeof data !== 'string') return;
      let jobId: string;
      try {
        jobId = decodeURI(data).replace('/jobs/', '');
      } catch {
        return;
      }
      void openStreams[socketId]?.close();
      const jobPath = jobsRepository.getJobPath(jobId);

      debug('start tailing (%s) -> "%s"', socketId, jobId);
      let failed = false;
      let closing: Promise<void> | undefined;
      const streams = sliceFile(jobPath).on('error', (err: Error) => {
        failed = true;
        debug('stream error %s: %s', jobId, err.message);
      });
      openStreams[socketId] = {
        close: () => {
          if (closing) return closing;
          if (failed) return Promise.resolve();
          closing = new Promise<void>(resolve => {
            streams.once('close', resolve);
            streams.once('error', resolve);
            streams.close();
          });
          return closing;
        },
      };
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
        void stream.close();
      }
    });
  });
  return async () => {
    const streams = Object.values(openStreams);
    for (const id of Object.keys(openStreams)) delete openStreams[id];
    await Promise.all(streams.map(stream => stream.close()));
    await new Promise<void>(resolve => io.close(() => resolve()));
  };
}
