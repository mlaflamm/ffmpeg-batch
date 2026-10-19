export const pLoop = (fn: () => Promise<unknown>, interval: number): (() => Promise<void>) => {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void>;
  const loop = () => {
    current = Promise.resolve()
      .then(fn)
      .then(
        () => {},
        () => {}
      )
      .then(() => {
        if (!stopped) timer = setTimeout(loop, interval);
      });
  };
  loop();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    return current;
  };
};
