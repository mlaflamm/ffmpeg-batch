import namespace from 'debug';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { Application } from 'express';
import { Server } from 'http';
import { JobsRepository } from '../libs/jobs.repository.js';
import { followFile } from '../libs/utils/follow-file.js';

const debug = namespace('ffmpeg-batch:websocket.loader');

export function attachWebsocket(app: Application, server: Server, jobsRepository: JobsRepository): () => Promise<void> {
  for (const route of ['/jobs/todo/:id', '/jobs/done/:id', '/jobs/error/:id', '/jobs/:id']) {
    app.get(route, (_, res) => res.sendFile(path.resolve('webui', 'tail.html')));
  }
  const streams = new Map<string, () => Promise<void>>();
  const closingStreams = new Set<Promise<void>>();
  let cleanupError: unknown;
  let stopping = false;
  const stopTail = (id: string) => {
    const stop = streams.get(id);
    streams.delete(id);
    if (!stop) return;
    const closing = stop();
    closingStreams.add(closing);
    void closing.then(
      () => closingStreams.delete(closing),
      err => {
        cleanupError = err;
        closingStreams.delete(closing);
      }
    );
  };
  const io = new SocketServer(server);
  io.on('connection', socket => {
    socket.on('tail', (data: unknown) => {
      if (stopping || typeof data !== 'string' || !data.startsWith('/jobs/')) return;
      let jobPath: string;
      try {
        jobPath = jobsRepository.getJobPath(decodeURI(data).slice('/jobs/'.length));
      } catch {
        return;
      }
      stopTail(socket.id);
      const stop = followFile(
        jobPath,
        line => {
          if (streams.get(socket.id) === stop) socket.emit('newLine', { line });
        },
        err => debug('tailing error %s: %s', jobPath, err.message)
      );
      streams.set(socket.id, stop);
    });
    socket.on('disconnect', () => stopTail(socket.id));
  });
  return async () => {
    stopping = true;
    for (const id of streams.keys()) stopTail(id);
    await Promise.all([...closingStreams, new Promise<void>(resolve => io.close(() => resolve()))]);
    if (cleanupError) throw cleanupError;
  };
}
