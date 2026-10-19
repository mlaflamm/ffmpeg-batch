import { createApplication } from './app.js';

async function main() {
  const application = await createApplication(process.env.NODE_ENV || 'development');
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error('Shutdown exceeded eight seconds');
      process.exit(1);
    }, 8000);
    try {
      await application.close();
    } catch (err) {
      console.error('Shutdown failed:', err);
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.removeListener('SIGTERM', shutdown);
      process.removeListener('SIGINT', shutdown);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  application.server.once('error', async err => {
    console.error('Server failed:', err);
    process.exitCode = 1;
    await shutdown();
  });
  const port = process.env.PORT || 3000;
  application.server.listen(port, () => console.log('Server listening on port %s', port));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
