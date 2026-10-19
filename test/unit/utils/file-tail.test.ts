import { assert } from 'chai';
import nodeAssert from 'assert';
import fs from 'fs';
import { followFile } from '../../../src/libs/utils/follow-file.js';
import { readLastLine } from '../../../src/libs/utils/read-last-line.js';
import { eventually } from '../../../src/libs/utils/eventually.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('File log readers', () => {
  const dir = '.test/file-tail';
  const file = `${dir}/log`;
  beforeEach(() => fs.promises.mkdir(dir, { recursive: true }));
  afterEach(() => fs.promises.rm(dir, { recursive: true, force: true }));

  it('reads final records backwards across chunk boundaries and newline conventions', async () => {
    for (const ending of ['', '\n', '\r', '\r\n']) {
      const last = 'unicode é😀' + 'x'.repeat(70000);
      await fs.promises.writeFile(file, 'history\n'.repeat(200000) + last + ending);
      assert.equal(await readLastLine(file), last);
    }
    await fs.promises.writeFile(file, 'only line');
    assert.equal(await readLastLine(file), 'only line');
    await fs.promises.writeFile(file, '');
    await nodeAssert.rejects(() => readLastLine(file), /empty/);
    await fs.promises.writeFile(file, 'x'.repeat(1024 * 1024 + 1));
    await nodeAssert.rejects(() => readLastLine(file), /exceeds/);
    await nodeAssert.rejects(() => readLastLine(`${dir}/missing`), /ENOENT/);
  });

  it('buffers partial lines, normalizes CR/LF, suppresses blanks and flushes on close', async () => {
    await fs.promises.writeFile(file, 'initial\npartial');
    const lines: string[] = [];
    const errors: Error[] = [];
    const close = followFile(
      file,
      line => lines.push(line),
      err => errors.push(err),
      10
    );
    try {
      await eventually(() => assert.deepEqual(lines, ['initial\n']), 10, 1000);
      await delay(30);
      assert.deepEqual(lines, ['initial\n']);
      await fs.promises.appendFile(file, '\r');
      await eventually(() => assert.lengthOf(lines, 2), 10, 1000);
      await fs.promises.appendFile(file, '\n\nprogress\r\nnext\nfinal');
      await eventually(() => assert.lengthOf(lines, 4), 10, 1000);
      await Promise.all([close(), close()]);
      assert.deepEqual(lines, ['initial\n', 'partial\n', 'progress\n', 'next\n', 'final\n']);
      assert.deepEqual(errors, []);
      await fs.promises.appendFile(file, 'ignored\n');
      await delay(30);
      assert.lengthOf(lines, 5);
    } finally {
      await close();
    }
  });

  it('streams long Unicode lines in bounded chunks and follows truncation', async () => {
    const text = '😀'.repeat(70000);
    await fs.promises.writeFile(file, text + '\n');
    const lines: string[] = [];
    const close = followFile(
      file,
      line => lines.push(line),
      err => {
        throw err;
      },
      10
    );
    try {
      await eventually(() => assert.equal(lines.join(''), text + '\n'), 10, 1000);
      assert.isAtMost(Math.max(...lines.map(line => line.length)), 2 * 64 * 1024 + 1);
      await fs.promises.writeFile(file, 'replaced\n');
      await eventually(() => assert.include(lines.join(''), 'replaced\n'), 10, 1000);
    } finally {
      await close();
    }
  });

  it('closes before opening and releases resources after open errors', async () => {
    await fs.promises.writeFile(file, 'line\n');
    const close = followFile(
      file,
      () => {},
      err => {
        throw err;
      },
      10
    );
    await close();
    const errors: Error[] = [];
    const closeMissing = followFile(
      `${dir}/missing`,
      () => {},
      err => errors.push(err),
      10
    );
    try {
      await eventually(() => assert.lengthOf(errors, 1), 10, 1000);
    } finally {
      await closeMissing();
    }
  });
});
