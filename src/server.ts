import 'reflect-metadata';

import assert from 'assert';
import Container from 'typedi';

import { Application } from 'express';

import { createAppFramework } from './app';

const randomString = () => {
  Math.random()
    .toString(36)
    .slice(7);
};

async function main() {
  const framework = await createAppFramework(process.env.NODE_ENV || 'development', Container.of(randomString));
  const app: Application = framework.settings.getData('app');
  assert(app, 'app must be provided');

  const port = process.env.PORT || 3000;
  app
    .listen(port)
    .once('listening', () => console.log('Server listening on port %s', port))
    .once('error', err => console.error('server crash: %s', err.message));
}

main().catch(console.error);
