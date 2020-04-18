import path from 'path';
import { Application } from 'express';
import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';

export const webuiLoader = (): MicroframeworkLoader => {
  return (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('microframework settings are required');
    }

    const app: Application = settings.getData('app');
    app.get('/jobs', (_, res) => res.sendFile(path.resolve('webui', 'jobs.html')));
  };
};
