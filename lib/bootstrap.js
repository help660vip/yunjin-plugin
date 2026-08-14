import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigService } from './config/service.js';
import { JsonRepository } from './storage/json-repository.js';
import { createLogger } from './observability/logger.js';
import { AuditLog } from './observability/audit.js';
import { featureManifests } from '../apps/manifest.js';

const runtimeKey = Symbol.for('yunjin.plugin.runtime');
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));

export function getRuntime(options = {}) {
  if (!globalThis[runtimeKey]) {
    const dataRoot = options.dataRoot ?? process.env.YUNJIN_DATA_DIR ?? path.resolve(process.cwd(), 'data', 'yunjin-plugin');
    const logger = options.logger ?? createLogger('YunJin');
    const audit = options.audit ?? new AuditLog(path.join(dataRoot, 'audit.jsonl'), { logger });
    const repository = new JsonRepository(path.join(dataRoot, 'config.json'), { logger });
    const config = new ConfigService({ repository, logger, audit });
    for (const manifest of featureManifests) {
      config.registerSchema(manifest.id, manifest.configSchema ?? {});
    }
    globalThis[runtimeKey] = {
      moduleRoot,
      dataRoot,
      logger,
      config,
      manifests: featureManifests,
      started: false,
      async start() {
        if (this.started) return this;
        await this.config.initialize();
        if (this.config.getGlobal('core.hot_reload') !== false) this.config.watch();
        this.started = true;
        return this;
      }
    };
  }
  return globalThis[runtimeKey];
}

export async function shutdownRuntime() {
  const runtime = globalThis[runtimeKey];
  if (!runtime) return;
  await runtime.config.close();
  delete globalThis[runtimeKey];
}
