import { assert } from 'chai';
import fs from 'fs';
import { createApplication } from '../../src/app.js';
import { eventually } from '../../src/libs/utils/eventually.js';

import { io as connect } from 'socket.io-client';

describe('Live logs', () => {
  it('serves and streams jobs with encoded filenames', async () => {
    const application = await createApplication('test');
    const ids = ['100% pure cold.job', 'todo/literal%20name.job', 'done/name#part?.job', 'error/café.job'];
    const paths = ids.map(id => application.repository.getJobPath(id));
    let socket: ReturnType<typeof connect> | undefined;
    try {
      await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
      const address = application.server.address();
      if (!address || typeof address === 'string') throw new Error('Missing server address');
      const origin = `http://127.0.0.1:${address.port}`;
      socket = connect(origin, { forceNew: true, reconnection: false });
      const lines: string[] = [];
      socket.on('newLine', (data: { line: string }) => lines.push(data.line));
      for (const [index, id] of ids.entries()) {
        const content = `log for ${id}\n`;
        await fs.promises.writeFile(paths[index], content);
        const pathname = '/jobs/' + id.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(origin + pathname, { signal: AbortSignal.timeout(1000) });
        assert.equal(response.status, 200);
        assert.include(await response.text(), 'id="tailing"');
        socket.emit('tail', pathname);
        await eventually(() => assert.include(lines.join(''), content), 10, 1000);
      }
    } finally {
      socket?.disconnect();
      await application.close();
      await Promise.all(paths.map(file => fs.promises.rm(file, { force: true })));
    }
  });

  it('delivers existing lines, CR progress, appended lines and reconnects', async function () {
    this.timeout(6000);
    const application = await createApplication('test');
    const jobPath = application.repository.getJobPath('socket.job');
    await fs.promises.writeFile(jobPath, 'header\nprogress\r');
    await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
    const address = application.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const handshake = await fetch(`http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://example.test' },
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(handshake.status, 200);
    assert.equal(handshake.headers.get('access-control-allow-origin'), 'https://example.test');
    assert.equal(handshake.headers.get('access-control-allow-credentials'), 'true');
    assert.include(await handshake.text(), '"sid"');
    const socket = connect(`http://127.0.0.1:${address.port}`, { forceNew: true, reconnection: false });
    const lines: string[] = [];
    socket.on('connect', () => {
      socket.emit('tail', null);
      socket.emit('tail', '/jobs/../../outside');
      socket.emit('tail', '/jobs/%zz');
      socket.emit('tail', '/jobs/socket.job');
    });
    socket.on('newLine', (data: { line: string }) => lines.push(data.line));
    try {
      await eventually(() => assert.include(lines.join(''), 'progress'), 10, 2000);
      await fs.promises.appendFile(jobPath, 'next\n');
      await eventually(() => assert.include(lines.join(''), 'next'), 10, 2000);
      await new Promise<void>(resolve => {
        socket.io.once('close', () => resolve());
        socket.disconnect();
      });
      lines.length = 0;
      socket.connect();
      await eventually(() => assert.include(lines.join(''), 'header'), 10, 2000);
    } finally {
      socket.disconnect();
      await application.close();
      await fs.promises.unlink(jobPath);
    }
  });
});
