export class StorageRepository {
  async read() {
    throw new Error('StorageRepository.read must be implemented by an adapter');
  }

  async write() {
    throw new Error('StorageRepository.write must be implemented by an adapter');
  }
}

export function namespacedKey(feature, ...parts) {
  return ['Yunjin', feature, ...parts].map((part) => String(part).replace(/[:\\s]+/gu, '_')).join(':');
}
