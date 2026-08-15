import { formatCount } from '../core/format.js';

export class MetricsRegistry {
  constructor(options = {}) {
    this.clock = options.clock || { now: () => Date.now() };
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.maxLabels = Number(options.maxLabels || 10000);
  }

  labelKey(labels = {}) {
    return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + String(value).slice(0, 120)).join(',');
  }

  counter(name, labels = {}, amount = 1) {
    const key = String(name) + '{' + this.labelKey(labels) + '}';
    const current = this.counters.get(key) || { name: String(name), labels: { ...labels }, value: 0, updatedAt: this.clock.now() };
    current.value += Number(amount) || 0;
    current.updatedAt = this.clock.now();
    this.counters.set(key, current);
    this.trim();
    return current.value;
  }

  gauge(name, value, labels = {}) {
    const key = String(name) + '{' + this.labelKey(labels) + '}';
    const current = { name: String(name), labels: { ...labels }, value: Number(value) || 0, updatedAt: this.clock.now() };
    this.gauges.set(key, current);
    this.trim();
    return current.value;
  }

  observe(name, value, labels = {}) {
    const key = String(name) + '{' + this.labelKey(labels) + '}';
    const current = this.histograms.get(key) || { name: String(name), labels: { ...labels }, count: 0, sum: 0, min: Infinity, max: -Infinity, updatedAt: this.clock.now() };
    const number = Number(value) || 0;
    current.count += 1;
    current.sum += number;
    current.min = Math.min(current.min, number);
    current.max = Math.max(current.max, number);
    current.updatedAt = this.clock.now();
    this.histograms.set(key, current);
    this.trim();
    return current;
  }

  time(name, labels = {}) {
    const start = this.clock.now();
    return (value) => this.observe(name, value === undefined ? this.clock.now() - start : value, labels);
  }

  trim() {
    const collections = [this.counters, this.gauges, this.histograms];
    for (const collection of collections) while (collection.size > this.maxLabels) collection.delete(collection.keys().next().value);
  }

  snapshot() {
    return {
      counters: [...this.counters.values()].map((item) => ({ ...item, display: formatCount(item.value) })),
      gauges: [...this.gauges.values()],
      histograms: [...this.histograms.values()].map((item) => ({ ...item, average: item.count ? item.sum / item.count : 0 }))
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

export function metricsRegistry(options) {
  return new MetricsRegistry(options);
}
