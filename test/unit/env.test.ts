import { assert } from 'chai';
import dotenv from 'dotenv';
import { Environment, parseDuration } from '../../src/env.js';

describe('Environment', () => {
  it('retains duration units and rejects invalid configuration before polling', () => {
    for (const [value, expected] of [
      ['5m', 300000],
      ['2 hours', 7200000],
      ['0', 0],
      ['.5s', 500],
      ['-1ms', -1],
    ] as const) {
      assert.equal(parseDuration(value), expected);
    }
    assert.throws(() => parseDuration('five minutes'), /Invalid duration/);
    assert.throws(() => parseDuration(''), /Invalid duration/);
  });

  it('preserves OS precedence, empty fallback, defaults and required production watch directory', () => {
    const values = { JOBS_ENABLED: 'false', JOBS_DIR: '', JOBS_POLL_INTERVAL: '3s', WATCH_DIR: '/tmp/watch' };
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, values);
      const env = new Environment('test');
      assert.isFalse(env.jobs.enabled);
      assert.equal(env.jobs.dir, '.test/jobs');
      assert.equal(env.jobs.pollIntervalMs, 3000);
      assert.equal(env.jobs.cleanupIntervalMs, 21600000);
      assert.equal(env.jobs.cleanupMaxAgeMs, 432000000);
      assert.equal(env.watch.dir, '/tmp/watch');
      delete process.env.WATCH_DIR;
      assert.throws(() => new Environment('production'), /WATCH_DIR/);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('uses current dotenv comment/quote syntax without modifying process.env', () => {
    const before = process.env.DEPENDENCY_REFRESH_SAMPLE;
    assert.deepEqual(dotenv.parse('A=one # comment\nB="two\\nlines"\nC=\' three \'\nD=\nE=`literal`\nF=x#y\n'), {
      A: 'one',
      B: 'two\nlines',
      C: ' three ',
      D: '',
      E: 'literal',
      F: 'x',
    });
    assert.equal(process.env.DEPENDENCY_REFRESH_SAMPLE, before);
  });
});
