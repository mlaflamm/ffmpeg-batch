export const pLoop = (fn: (...args: any) => Promise<any>, interval: number): (() => Promise<void>) => {
  let stopped = false;
  let current = Promise.resolve();

  const stop = () => {
    stopped = true;
    return current;
  };
  const loop = async () => {
    if (stopped) {
      return;
    }
    current = fn()
      .then(() => {})
      .catch(() => {});

    await current;
    setTimeout(loop, interval);
  };
  loop();
  return stop;
};