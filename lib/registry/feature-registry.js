export class FeatureRegistry {
  constructor(manifests, config) {
    this.manifests = [...manifests].sort((a, b) => a.id.localeCompare(b.id));
    this.config = config;
  }

  get(id) {
    return this.manifests.find((manifest) => manifest.id === String(id));
  }

  isEnabled(id, scope = {}) {
    const manifest = this.get(id);
    if (!manifest) return false;
    return this.config.getEffective(scope)['feature.' + manifest.id + '.enabled'] ?? manifest.enabledByDefault !== false;
  }

  list(scope = {}) {
    return this.manifests.map((manifest) => ({
      ...manifest,
      enabled: this.isEnabled(manifest.id, scope)
    }));
  }
}
