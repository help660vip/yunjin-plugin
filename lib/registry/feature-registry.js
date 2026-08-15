export class FeatureRegistry {
  constructor(manifests, config) {
    const input = Array.isArray(manifests) ? manifests : [];
    const ids = new Set();
    const commands = new Set();
    this.manifests = input.map((manifest, index) => {
      const normalized = validateManifest(manifest, index);
      if (ids.has(normalized.id)) throw new Error('\u91cd\u590d\u80fd\u529b\u7f16\u53f7\uff1a' + normalized.id);
      if (commands.has(normalized.command)) throw new Error('\u91cd\u590d\u80fd\u529b\u547d\u4ee4\uff1a' + normalized.command);
      ids.add(normalized.id);
      commands.add(normalized.command);
      return normalized;
    }).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
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


function validateManifest(manifest, index) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('\u80fd\u529b\u6e05\u5355\u7b2c ' + (index + 1) + ' \u9879\u4e0d\u662f\u5bf9\u8c61');
  const id = String(manifest.id || '');
  if (!/^\d{2}$/.test(id)) throw new TypeError('\u80fd\u529b\u6e05\u5355\u7f16\u53f7\u65e0\u6548\uff1a' + id);
  if (typeof manifest.command !== 'string' || !manifest.command.trim()) throw new TypeError('\u80fd\u529b\u6e05\u5355\u547d\u4ee4\u65e0\u6548\uff1a' + id);
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) throw new TypeError('\u80fd\u529b\u6e05\u5355\u547d\u4ee4\u5217\u8868\u4e3a\u7a7a\uff1a' + id);
  return { ...manifest, id, command: manifest.command.trim(), commands: [...manifest.commands] };
}
