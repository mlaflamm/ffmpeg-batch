import fs from 'fs';
import ms from 'ms';
import dotenv from 'dotenv';

const isDuration = (value: string): value is ms.StringValue =>
  value.length <= 100 &&
  /^-?(?:\d+)?\.?\d+ *(?:milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.test(
    value
  );

export function parseDuration(value: string): number {
  if (!isDuration(value)) throw new Error(`Invalid duration: ${value}`);
  return ms(value);
}

export class Environment {
  public nodeEnv: string;

  public jobs: {
    enabled: boolean;
    dir: string;
    pollIntervalMs: number;
    cleanupIntervalMs: number;
    cleanupMaxAgeMs: number;
    detailsList: boolean;
  };
  public watch: {
    enabled: boolean;
    dir: string;
    pollIntervalMs: number;
    defaultScript: string;
  };

  constructor(environment: string) {
    const envFile = `.env.${environment}`;
    const baseEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

    const getOsEnv = (key: string): string => (process.env[key] as string) || baseEnv[key] || '';
    const toBool = (value: string): boolean => value === 'true';
    // const toNumber = (value: string): number | undefined => parseInt(value, 10) || undefined;

    const developmentEnvironments = ['development', 'preview', 'local', 'test'];
    const devOnly = (key: string, defaultValue: string) => {
      if (!developmentEnvironments.includes(environment)) {
        throw new Error(`Must override value '${key}' in environment!`);
      }
      return defaultValue;
    };

    this.nodeEnv = environment;
    this.jobs = {
      enabled: toBool(getOsEnv('JOBS_ENABLED')),
      dir: getOsEnv('JOBS_DIR') || '.temp/jobs',
      pollIntervalMs: parseDuration(getOsEnv('JOBS_POLL_INTERVAL') || '5m'),
      cleanupIntervalMs: parseDuration(getOsEnv('JOBS_CLEANUP_INTERVAL') || '6h'),
      cleanupMaxAgeMs: parseDuration(getOsEnv('JOBS_CLEANUP_MAX_AGE') || '5d'),
      detailsList: toBool(getOsEnv('JOBS_DETAILS_LIST')),
    };
    this.watch = {
      enabled: toBool(getOsEnv('WATCH_ENABLED')),
      dir: getOsEnv('WATCH_DIR') || devOnly('WATCH_DIR', '.temp/watch'),
      pollIntervalMs: parseDuration(getOsEnv('WATCH_POLL_INTERVAL') || '2m'),
      defaultScript: getOsEnv('WATCH_DEFAULT_SCRIPT') || 'scale.sh',
    };
  }
}
