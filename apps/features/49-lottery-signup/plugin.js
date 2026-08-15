import { createFeaturePlugin } from '../factory.js';
import { manifest, featureId, command, access, area, acceptance } from './manifest.js';

export const Plugin = createFeaturePlugin(manifest);
export const pluginMeta = Object.freeze({ featureId, command, access, area, acceptance });
export function create() {
  return new Plugin();
}
export default Plugin;
