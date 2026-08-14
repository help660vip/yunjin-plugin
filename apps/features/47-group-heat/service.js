import { executeFeature } from '../../../lib/features/service.js';
export function run(event, args, runtime) { return executeFeature(manifest, event, args, runtime); }
import manifest from './manifest.js';
