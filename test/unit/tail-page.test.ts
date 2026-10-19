import { assert } from 'chai';
import fs from 'fs';
import vm from 'vm';

describe('Live-log page', () => {
  it('renders socket logs as text, clears on reconnect and scrolls to the end', async () => {
    const page = await fs.promises.readFile('webui/tail.html', 'utf8');
    assert.notInclude(page, 'jquery');
    const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.isString(script);
    const handlers: Record<string, (...args: any[]) => void> = {};
    const nodes: { textContent: string; nodeType: number }[] = [];
    const emissions: unknown[][] = [];
    let scrolled = 0;
    let scheduled: (() => void) | undefined;
    const tailing = {
      append: (node: (typeof nodes)[number]) => nodes.push(node),
      replaceChildren: () => {
        nodes.length = 0;
      },
    };
    const document = {
      title: '',
      addEventListener: (_name: string, ready: () => void) => ready(),
      getElementById: (id: string) =>
        id === 'tailing'
          ? tailing
          : {
              scrollIntoView: () => {
                scrolled++;
              },
            },
      createTextNode: (textContent: string) => ({ textContent, nodeType: 3 }),
    };
    vm.runInNewContext(script!, {
      document,
      window: { location: { pathname: '/jobs/todo/sample.job' } },
      console: { log: () => {} },
      setTimeout: (fn: () => void) => {
        scheduled = fn;
        return 1;
      },
      clearTimeout: () => {
        scheduled = undefined;
      },
      io: () => ({
        on: (name: string, handler: (typeof handlers)[string]) => {
          handlers[name] = handler;
        },
        emit: (...args: unknown[]) => emissions.push(args),
      }),
    });
    handlers.connect();
    assert.equal(document.title, 'sample');
    assert.deepEqual(emissions, [['tail', '/jobs/todo/sample.job']]);
    const markup = '<img src=x onerror="alert(1)"><b>literal & text</b>\n';
    handlers.newLine({ line: markup });
    handlers.newLine({ line: 'next\n' });
    scheduled?.();
    assert.equal(nodes.map(node => node.textContent).join(''), markup + 'next\n');
    assert.isTrue(nodes.every(node => node.nodeType === 3));
    assert.isAtLeast(scrolled, 1);
    handlers.connect();
    assert.lengthOf(nodes, 0);
    assert.lengthOf(emissions, 2);
  });
});
