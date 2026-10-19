import { assert } from 'chai';
import fs from 'fs';
import { createApplication } from '../../src/app.js';
import { eventually } from '../../src/libs/utils/eventually.js';

import { io as connect } from 'socket.io-client';

describe('Live logs', () => {
  it('delivers existing lines, CR progress, appended lines and reconnects', async function () {
    this.timeout(6000);
    const application = await createApplication('test');
    const jobPath = application.repository.getJobPath('socket.job');
    await fs.promises.writeFile(jobPath, 'header\nprogress\r');
    await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
    const address = application.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const socket = connect(`http://127.0.0.1:${address.port}`, { forceNew: true, reconnection: false });
    const lines: string[] = [];
    socket.on('connect', () => socket.emit('tail', '/jobs/socket.job'));
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
