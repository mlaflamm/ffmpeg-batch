import { ContainerInstance } from 'typedi';
import { bootstrapMicroframework } from 'microframework-w3tec';

import { Environment } from './env';
import { expressLoader } from './loaders/express.loader';
import { controllerLoader } from './loaders/controller.loader';
import { jobsLoader } from './loaders/jobs.loader';
import { webuiLoader } from './loaders/webui.loader';
import { websocketLoader } from './loaders/websocket.loader';

export function createAppFramework(environment: string, container: ContainerInstance) {
  const env = new Environment(environment);
  container.set(Environment, env);

  return bootstrapMicroframework([
    expressLoader(env),
    jobsLoader(env, container),
    webuiLoader(),
    controllerLoader(container),
    websocketLoader(env, container),
  ]);
}
