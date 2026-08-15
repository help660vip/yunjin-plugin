import { stableId } from '../core/ids.js';
import { cleanText } from '../core/safe.js';
import { FEATURE_LIMITS } from '../core/constants.js';

function literalMatch(text, value, options = {}) {
  const source = String(text || '');
  const needle = String(value || '');
  if (!needle) return false;
  return options.caseSensitive ? source.includes(needle) : source.toLowerCase().includes(needle.toLowerCase());
}

export class RuleEngine {
  constructor(options = {}) {
    this.maxRules = Number(options.maxRules || 500);
    this.maxResponse = Number(options.maxResponse || 1000);
    this.cooldownMs = Number(options.cooldownMs || 3000);
    this.rules = [];
    this.cooldowns = new Map();
    this.clock = options.clock || { now: () => Date.now() };
  }

  normalize(input = {}) {
    const trigger = cleanText(input.trigger || input.word || input.value, { max: 100 });
    const response = cleanText(input.response || input.reply || '', { max: this.maxResponse });
    if (!trigger) throw new Error('rule trigger required');
    return {
      id: input.id || stableId([trigger, response]),
      trigger,
      response,
      enabled: input.enabled !== false,
      mode: input.mode || 'contains',
      caseSensitive: input.caseSensitive === true,
      createdAt: input.createdAt || this.clock.now(),
      updatedAt: this.clock.now()
    };
  }

  add(input) {
    const rule = this.normalize(input);
    this.rules = [rule, ...this.rules.filter((item) => item.id !== rule.id && item.trigger !== rule.trigger)].slice(0, this.maxRules);
    return { ...rule };
  }

  remove(idOrTrigger) {
    const value = String(idOrTrigger);
    const before = this.rules.length;
    this.rules = this.rules.filter((item) => item.id !== value && item.trigger !== value);
    return before - this.rules.length;
  }

  enable(idOrTrigger, enabled = true) {
    const item = this.rules.find((entry) => entry.id === String(idOrTrigger) || entry.trigger === String(idOrTrigger));
    if (!item) return false;
    item.enabled = Boolean(enabled);
    item.updatedAt = this.clock.now();
    return true;
  }

  match(text, context = {}) {
    const value = cleanText(text, { max: FEATURE_LIMITS.commandText });
    const now = this.clock.now();
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const matched = rule.mode === 'equals' ? (rule.caseSensitive ? value === rule.trigger : value.toLowerCase() === rule.trigger.toLowerCase()) : literalMatch(value, rule.trigger, rule);
      if (!matched) continue;
      const key = [context.botId || 'default', context.groupId || 'private', context.userId || 'unknown', rule.id].join(':');
      const previous = this.cooldowns.get(key) || 0;
      if (previous + this.cooldownMs > now) return { matched: true, suppressed: true, rule };
      this.cooldowns.set(key, now);
      return { matched: true, suppressed: false, rule: { ...rule, response: rule.response.slice(0, this.maxResponse) } };
    }
    return { matched: false, suppressed: false, rule: null };
  }

  import(values = []) {
    this.rules = [];
    for (const value of values.slice(0, this.maxRules)) {
      try { this.add(value); } catch {}
    }
    return this.rules.length;
  }

  export() {
    return this.rules.map((item) => ({ ...item }));
  }

  clearCooldowns() {
    this.cooldowns.clear();
  }

  stats() {
    return { rules: this.rules.length, enabled: this.rules.filter((item) => item.enabled).length, cooldowns: this.cooldowns.size };
  }
}

export function ruleEngine(options) {
  return new RuleEngine(options);
}
