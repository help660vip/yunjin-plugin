import { systemClock } from './clock.js';
import { YunjinError, ERROR_CODES } from './errors.js';

export class KeyedMutex {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.queues = new Map();
    this.maxKeys = Number(options.maxKeys || 10000);
  }

  async acquire(key, options = {}) {
    const name = String(key);
    const previous = this.queues.get(name) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.queues.set(name, tail);
    try {
      if (Number(options.timeoutMs || 0) > 0) {
        await Promise.race([
          previous,
          this.clock.sleep(options.timeoutMs).then(() => {
            throw new YunjinError(ERROR_CODES.TASK_CONFLICT, '资源正在被其他任务使用。', { status: 409, retryable: true });
          })
        ]);
      } else {
        await previous;
      }
    } catch (error) {
      release();
      if (this.queues.get(name) === tail) this.queues.delete(name);
      throw error;
    }
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      release();
      if (this.queues.get(name) === tail) this.queues.delete(name);
      this.trim();
    };
  }

  async runExclusive(key, operation, options = {}) {
    const release = await this.acquire(key, options);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  trim() {
    if (this.queues.size <= this.maxKeys) return;
    for (const key of this.queues.keys()) {
      this.queues.delete(key);
      if (this.queues.size <= this.maxKeys) break;
    }
  }

  clear() {
    this.queues.clear();
  }
}

export class Semaphore {
  constructor(limit, options = {}) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.active = 0;
    this.waiters = [];
    this.clock = options.clock || systemClock;
  }

  async acquire(options = {}) {
    if (this.active < this.limit) {
      this.active += 1;
      return this.release.bind(this);
    }
    const wait = new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
    if (Number(options.timeoutMs || 0) > 0) {
      await Promise.race([
        wait,
        this.clock.sleep(options.timeoutMs).then(() => {
          throw new YunjinError(ERROR_CODES.TASK_CONFLICT, '并发资源已满。', { status: 429, retryable: true });
        })
      ]);
    } else {
      await wait;
    }
    this.active += 1;
    return this.release.bind(this);
  }

  release() {
    if (this.active > 0) this.active -= 1;
    this.waiters.shift()?.resolve();
  }

  async run(operation, options = {}) {
    const release = await this.acquire(options);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  close(error = new Error('semaphore closed')) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

export class Once {
  constructor() {
    this.values = new Map();
  }

  async run(key, operation) {
    const name = String(key);
    if (this.values.has(name)) return this.values.get(name);
    const promise = Promise.resolve().then(operation);
    this.values.set(name, promise);
    try {
      return await promise;
    } finally {
      if (this.values.get(name) === promise) this.values.delete(name);
    }
  }

  clear() {
    this.values.clear();
  }
}
