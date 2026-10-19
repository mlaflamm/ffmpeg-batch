import { assert } from 'chai';
import { getFixtures, Fixtures } from '../fixtures.js';

describe('HTTP contracts', () => {
  let fixtures: Fixtures;
  before(async () => {
    fixtures = await getFixtures();
  });
  after(() => fixtures.release());

  it('preserves JSON validation, parser errors, empty missing results and CORS ordering', async () => {
    const request = fixtures.request;
    const missing = await request.get('/api/jobs/missing').set('Origin', 'https://example.test');
    assert.equal(missing.status, 404);
    assert.equal(missing.text, '');
    assert.equal(missing.headers['access-control-allow-origin'], '*');
    const invalid = await request.post('/api/jobs').send({});
    assert.equal(invalid.status, 400);
    assert.include(invalid.body.message, 'inputFilePath');
    const empty = await request.post('/api/jobs');
    assert.equal(empty.status, 400);
    assert.equal(empty.body.message, invalid.body.message);
    const text = await request.post('/api/jobs').set('Content-Type', 'text/plain').send('ignored');
    assert.equal(text.status, 400);
    assert.equal(text.body.message, invalid.body.message);
    const malformed = await request.post('/api/jobs').set('Content-Type', 'application/json').send('{');
    assert.equal(malformed.status, 400);
    assert.isString(malformed.body.message);
    assert.isUndefined(malformed.headers['access-control-allow-origin']);
    const options = await request.options('/api/jobs').set('Origin', 'https://example.test');
    assert.equal(options.status, 204);
    assert.equal(options.headers['access-control-allow-origin'], '*');
    const unknown = await request.get('/unknown').set('Origin', 'https://example.test');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.headers['access-control-allow-origin'], '*');
    const page = await request.get('/jobs').set('Origin', 'https://example.test');
    assert.equal(page.status, 200);
    assert.isUndefined(page.headers['access-control-allow-origin']);
    assert.deepEqual((await request.get('/api/jobs?status=todo&status=done')).body, []);
  });

  it('rejects job paths escaping the configured directory', async () => {
    const response = await fixtures.request.get('/api/jobs/%2E%2E%2Foutside');
    assert.equal(response.status, 400);
    assert.include(response.body.message, 'inside the jobs directory');
  });

  it('maps async failures and rejects oversized bodies', async () => {
    const missingInput = await fixtures.request
      .post('/api/jobs')
      .send({ inputFilePath: '.test/absent', scriptName: 'test.sh' });
    assert.equal(missingInput.status, 500);
    assert.include(missingInput.body.message, 'ENOENT');
    const oversized = await fixtures.request.post('/api/jobs').send({ inputFilePath: 'x'.repeat(110000) });
    assert.equal(oversized.status, 413);
  });
});
