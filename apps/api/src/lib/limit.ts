/**
 * Tiny FIFO semaphore. Residential proxies and our home relay both have small
 * concurrency budgets — firing 8 parallel scrapes at them makes every request
 * crawl, so the egress helpers share these limiters.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

export const proxyLimit = new Semaphore(2);
export const relayLimit = new Semaphore(4);
