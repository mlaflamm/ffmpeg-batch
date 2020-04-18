import bodyParser from 'body-parser';
import express, { Application } from 'express';
import morgan from 'morgan';

import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';
import { Environment } from '../env';

export function expressLoader(env: Environment): MicroframeworkLoader {
  return (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('Bootstrap Microframework did not provide settings');
    }

    const app: Application = express();

    if (env.nodeEnv !== 'test') {
      app.use(morgan('dev'));
    }

    app.use(bodyParser.json());

    settings.setData('app', app);
  };
}
