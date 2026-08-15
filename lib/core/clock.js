import { DEFAULT_TIME_ZONE } from './constants.js';

export class Clock {
  constructor(options = {}) {
    this.timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    this.nowSource = typeof options.now === 'function' ? options.now : () => Date.now();
  }

  now() {
    return Number(this.nowSource());
  }

  date(value = this.now()) {
    return new Date(value);
  }

  iso(value = this.now()) {
    return this.date(value).toISOString();
  }

  dayKey(value = this.now(), timeZone = this.timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(this.date(value));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return map.year + '-' + map.month + '-' + map.day;
  }

  minuteKey(value = this.now(), timeZone = this.timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(this.date(value));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return map.year + '-' + map.month + '-' + map.day + 'T' + map.hour + ':' + map.minute;
  }

  format(value = this.now(), options = {}) {
    return new Intl.DateTimeFormat(options.locale || 'zh-CN', {
      timeZone: options.timeZone || this.timeZone,
      dateStyle: options.dateStyle || 'medium',
      timeStyle: options.timeStyle || 'short',
      hour12: false
    }).format(this.date(value));
  }

  offsetMinutes(value, timeZone = this.timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', hour: '2-digit' }).formatToParts(this.date(value));
    const zone = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = zone.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!match) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
  }

  startOfDay(value = this.now(), timeZone = this.timeZone) {
    const day = this.dayKey(value, timeZone);
    const [year, month, date] = day.split('-').map(Number);
    const noon = Date.UTC(year, month - 1, date, 12);
    return noon - (12 * 60 + this.offsetMinutes(noon, timeZone)) * 60 * 1000;
  }

  deadline(ms) {
    return this.now() + Math.max(0, Number(ms) || 0);
  }

  remaining(deadline) {
    return Math.max(0, Number(deadline) - this.now());
  }

  sleep(ms, signal) {
    const delay = Math.max(0, Number(ms) || 0);
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason || new Error('aborted'));
        return;
      }
      let timer;
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(signal.reason || new Error('aborted'));
      };
      timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  parseDate(value, fallback = this.now()) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}

export const systemClock = new Clock();
