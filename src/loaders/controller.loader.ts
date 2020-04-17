import assert from 'assert';

import { ValidationError } from 'myzod';
import { Application, Request, Response, NextFunction } from 'express';
import { MicroframeworkLoader, MicroframeworkSettings } from 'microframework-w3tec';
import { useContainer, useExpressServer } from 'routing-controllers';
import { ContainerInstance } from 'typedi';

export function controllerLoader(container: ContainerInstance): MicroframeworkLoader {
  return (settings: MicroframeworkSettings | undefined) => {
    if (!settings) {
      throw new Error('Bootstrap Microframework did not provide settings');
    }
    const app: Application = settings.getData('app');
    assert(app, 'app was not found in microframework settings');

    useContainer(container);

    useExpressServer(app, {
      cors: true,
      classTransformer: true,
      defaultErrorHandler: false,
      controllers: [],
    });

    // This is the thing that I fixed inside of routing-controllers for E2. Even if we send a response,
    // The framework calls next and so our UI handlers get hit on GET requests. For now we can check
    // if the headers have been sent to the client, and if they have, just end the middleware chain by not
    // calling next.
    app.use((_, res, next) => {
      if (res.headersSent) {
        return;
      }
      next();
    });

    // MongoDB Error Handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.name !== 'MongoError') {
        return next(err);
      }
      switch (err.code) {
        case 11000:
          return res.status(409).json({ message: 'resource conflict' });
        default:
          return res.status(500).json({ message: 'unexpected error' });
      }
    });

    // MyZod error handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (!(err instanceof ValidationError)) {
        return next(err);
      }
      return res.status(400).json({ message: err.message });
    });

    // Error Handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({
        message: err.message,
      });
    });
  };
}
