export class Environment {
  public jobs: {
    dir: string;
    pollIntervalMs: number;
  };
  public watch: {
    dir: string;
    pollIntervalMs: number;
    defaultScript: string;
  };

  constructor(environment: string) {
    const getOsEnv = (key: string): string => (process.env[key] as string) ||  '';
    // const toBool = (value: string): boolean => value === 'true';
    const toNumber = (value: string): number | undefined => parseInt(value, 10) || undefined;

    const developmentEnvironments = ['development', 'preview', 'local', 'test'];
    const devOnly = (key: string, defaultValue: string) => {
      if (!developmentEnvironments.includes(environment)) {
        throw new Error(`Must override value '${key}' in environment!`);
      }
      return defaultValue;
    };

    this.jobs = {
      dir: getOsEnv('JOBS_DIR') || '/config/jobs',
      pollIntervalMs: toNumber(getOsEnv('JOBS_POLL_INTERVAL_MS')) || 1 * 60 * 1000,
    };
    this.watch = {
      dir: getOsEnv('WATCH_DIR') || devOnly('WATCH_DIR', '/config/watch'),
      pollIntervalMs: toNumber(getOsEnv('WATCH_POLL_INTERVAL_MS')) || 2 * 60 * 1000,
      defaultScript: getOsEnv('WATCH_DEFAULT_SCRIPT') || 'scale.sh',
    };
  }
}
