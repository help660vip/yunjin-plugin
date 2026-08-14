import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigService } from './config/service.js';
import { JsonRepository } from './storage/json-repository.js';
import { createLogger } from './observability/logger.js';
import { AuditLog } from './observability/audit.js';
import { featureManifests } from '../apps/manifest.js';
import { FeatureRegistry } from './registry/feature-registry.js';
import { SchedulerService } from './scheduler/service.js';

const runtimeKey = Symbol.for('yunjin.plugin.runtime');
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));

export function getRuntime(options = {}) {
  if (!globalThis[runtimeKey]) {
    const dataRoot = options.dataRoot ?? process.env.YUNJIN_DATA_DIR ?? path.resolve(process.cwd(), 'data', 'yunjin-plugin');
    const logger = options.logger ?? createLogger('YunJin');
    const audit = options.audit ?? new AuditLog(path.join(dataRoot, 'audit.jsonl'), { logger });
    const repository = options.repository ?? new JsonRepository(path.join(dataRoot, 'config.json'), { logger });
    const stateRepository = options.stateRepository ?? new JsonRepository(path.join(dataRoot, 'state.json'), { logger });
    const scheduler = options.scheduler ?? new SchedulerService(stateRepository, { logger, onExecute: (task) => audit.record({ action: 'scheduler.execute', taskId: task.id, featureId: task.featureId }) });
    const config = new ConfigService({ repository, logger, audit });
    for (const manifest of featureManifests) config.registerSchema(manifest.id, manifest.configSchema ?? {});
    const registry = new FeatureRegistry(featureManifests, config);
    globalThis[runtimeKey] = {
      moduleRoot,
      dataRoot,
      logger,
      audit,
      config,
      registry,
      stateRepository,
      scheduler,
      manifests: featureManifests,
      started: false,
      async start() {
        if (this.started) return this;
        await this.config.initialize();
        if (this.config.getGlobal('core.hot_reload') !== false) this.config.watch();
        for (const task of await this.scheduler.list()) this.scheduler.schedule(task);
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
  await runtime.scheduler.close();
  await runtime.config.close();
  delete globalThis[runtimeKey];
}

