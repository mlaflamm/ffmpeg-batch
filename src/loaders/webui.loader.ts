import path from 'path';
import { Application } from 'express';

export function attachWebui(app: Application): void {
  app.get('/', (_, res) => res.redirect('/jobs'));
  app.get('/jobs', (_, res) => res.sendFile(path.resolve('webui', 'jobs.html')));
  app.get('/ffmpeg-icon.png', (_, res) => res.sendFile(path.resolve('webui', 'ffmpeg-icon.png')));
}
