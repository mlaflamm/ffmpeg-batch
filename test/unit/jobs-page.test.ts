import { assert } from 'chai';
import fs from 'fs';
import vm from 'vm';

describe('Jobs page', () => {
  for (const id of ['100% pure cold.job', 'todo/literal%20name.job', 'done/name#part?.job', 'error/café.job']) {
    it(`opens an encoded live-log URL for ${id}`, async () => {
      const page = await fs.promises.readFile('webui/jobs.html', 'utf8');
      const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      assert.isString(script);
      let opened: string | undefined;
      type Element = {
        classList: { add: (...names: string[]) => void };
        append: (...children: Element[]) => void;
        onclick?: () => void;
      };
      let rendered!: (children: Element[]) => void;
      const rendering = new Promise<Element[]>(resolve => {
        rendered = resolve;
      });
      const location = new URL('http://localhost/jobs?status=done');
      vm.runInNewContext(script!, {
        URL,
        document: {
          location,
          getElementById: () => ({ append: (...children: Element[]) => rendered(children) }),
          createElement: () => ({ classList: { add: () => {} }, append: () => {} }),
        },
        window: {
          location,
          open: (url: string) => {
            opened = url;
          },
        },
        fetch: async () => ({ json: async () => [{ id, status: 'done' }] }),
        setTimeout: () => {},
      });
      const children = await rendering;
      children.at(-1)!.onclick!();
      const url = new URL(opened!, location);
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      assert.equal(decodeURIComponent(url.pathname), '/jobs/' + id);
      assert.include(url.pathname, id.split('/').map(encodeURIComponent).join('/'));
    });
  }
});
