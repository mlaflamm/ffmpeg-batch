import bodyParser from 'body-parser';
import express, { Application } from 'express';
import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';

export function expressLoader(): MicroframeworkLoader {
  return (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('Bootstrap Microframework did not provide settings');
    }

    const app: Application = express();

    app.use(bodyParser.json());

    app.get('/about', (req, res, next) => {
      res.json({
        version: 'None of your business',
        description: 'CV Training App',
      });
    });

    settings.setData('app', app);
  };
}
