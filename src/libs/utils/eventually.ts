type Func = () => any;

type UnwrapReturnType<T extends (...args: any[]) => any> = T extends (...args: any[]) => Promise<infer K>
  ? K
  : ReturnType<T>;

type TestFunc = (abort: () => void) => any;

export function eventually<T extends TestFunc>(fn: T, timeout: number): Promise<UnwrapReturnType<T>>;
export function eventually<T extends TestFunc>(
  fn: T,
  retryInterval: number,
  timeout: number
): Promise<UnwrapReturnType<T>>;

export function eventually<T extends Func>(
  fn: T,
  retryInterval: number,
  timeout?: number
): Promise<UnwrapReturnType<T>> {
  if (!timeout) {
    timeout = retryInterval;
    retryInterval = 500;
  }
  const threshold = Date.now() + timeout;

  const loop = async (fn: TestFunc): Promise<UnwrapReturnType<T>> => {
    let aborted = false;
    const abort = () => {
      aborted = true;
    };
    try {
      return await fn(abort);
    } catch (err) {
      if (Date.now() >= threshold || aborted) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      return loop(fn);
    }
  };

  return loop(fn);
}
