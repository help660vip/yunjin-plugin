export const FEATURE_AREAS = Object.freeze({
  core: Object.freeze(['01', '02', '03', '04', '05', '06', '07', '08']),
  governance: Object.freeze(['09', '10', '11', '12', '13', '14', '15', '16', '17']),
  feeds: Object.freeze(['18', '19', '20', '21', '22', '23', '24', '25', '26']),
  tools: Object.freeze(['27', '28', '29', '30', '31', '32', '33', '34', '35']),
  media: Object.freeze(['36', '37', '38', '39', '40', '41', '42', '43']),
  community: Object.freeze(['44', '45', '46', '47', '48', '49', '50'])
});

export const FEATURE_IDS = Object.freeze(Object.values(FEATURE_AREAS).flat());

export const FEATURE_LIMITS = Object.freeze({
  defaultText: 4000,
  commandText: 2000,
  storedText: 10000,
  pageSize: 20,
  maxPageSize: 100,
  maxItemsPerScope: 2000,
  maxGroupsPerUser: 500,
  maxUsersPerGroup: 50000,
  maxSubscriptions: 200,
  maxTasks: 200,
  maxImageBytes: 8 * 1024 * 1024,
  maxAudioBytes: 20 * 1024 * 1024,
  maxArchiveBytes: 16 * 1024 * 1024,
  maxResponseBytes: 1024 * 1024
});

export const RATE_LIMITS = Object.freeze({
  command: Object.freeze({ capacity: 12, refillPerSecond: 0.2 }),
  network: Object.freeze({ capacity: 4, refillPerSecond: 0.05 }),
  render: Object.freeze({ capacity: 3, refillPerSecond: 0.02 }),
  moderation: Object.freeze({ capacity: 20, refillPerSecond: 0.2 }),
  scheduled: Object.freeze({ capacity: 30, refillPerSecond: 0.5 })
});

export const QUOTAS = Object.freeze({
  networkDaily: 200,
  renderDaily: 80,
  savedItemsDaily: 100,
  broadcastDaily: 50
});

export const REDIS_NAMESPACE = 'Yunjin';
export const DATA_VERSION = 2;
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export function areaForFeature(id) {
  const value = String(id).padStart(2, '0');
  for (const [area, ids] of Object.entries(FEATURE_AREAS)) {
    if (ids.includes(value)) return area;
  }
  return 'unknown';
}

export function isFeatureId(value) {
  return FEATURE_IDS.includes(String(value).padStart(2, '0'));
}

export function featureKey(id, suffix = 'state') {
  const normalized = String(id).padStart(2, '0');
  return 'feature.' + normalized + '.' + String(suffix).replace(/[^a-zA-Z0-9._-]/g, '_');
}
