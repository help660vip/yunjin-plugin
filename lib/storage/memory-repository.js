export class MemoryRepository {
  constructor(initial = {}) {
    this.value = structuredClone(initial);
    this.closed = false;
  }

  async read(fallback = {}) {
    if (this.closed) throw new Error('repository closed');
    return structuredClone(this.value ?? fallback);
  }

  async write(value) {
    if (this.closed) throw new Error('repository closed');
    this.value = structuredClone(value);
    return this.read();
  }

  async update(fallback, updater) {
    if (this.closed) throw new Error('repository closed');
    const current = this.value ?? structuredClone(fallback);
    const result = await updater(current);
    this.value = current;
    return result;
  }

  close() {
    this.closed = true;
  }
}
