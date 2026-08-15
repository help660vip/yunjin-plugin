import test from 'node:test';
import assert from 'node:assert/strict';
import { DailyTaskLedger, TaskLedger } from '../../lib/features/tasks.js';

function clock() {
  return { now: () => 1000, parseDate: (value) => Number(value), dayKey: () => '\u4eca\u5929' };
}

test('\u4efb\u52a1 ID\u3001\u5e03\u5c14\u503c\u548c\u6761\u76ee\u4e0a\u9650\u4fdd\u6301\u4e00\u81f4', () => {
  const ledger = new TaskLedger({ clock: clock(), maxItems: Number.POSITIVE_INFINITY });
  assert.equal(ledger.maxItems, 500);
  const task = ledger.add({ id: 123, text: '\u6d4b\u8bd5', done: 'false', tags: ['a', 'a', ''] });
  assert.equal(task.id, '123');
  assert.equal(task.done, false);
  assert.deepEqual(task.tags, ['a']);
  assert.equal(ledger.find(123).id, '123');
});

test('\u4efb\u52a1\u5217\u8868\u548c\u5bfc\u5165\u62d2\u7edd\u65e0\u6548\u9650\u5236', () => {
  const ledger = new TaskLedger({ clock: clock() });
  ledger.add({ text: 'a' });
  ledger.add({ text: 'b' });
  assert.equal(ledger.list({}, { limit: Number.POSITIVE_INFINITY }).length, 2);
  assert.equal(ledger.import(null), 0);
});

test('\u7a7a\u65e5\u4efb\u52a1\u76ee\u5f55\u4f7f\u7528\u5b89\u5168\u9ed8\u8ba4\u503c', () => {
  const daily = new DailyTaskLedger({ clock: clock(), catalog: [] });
  const item = daily.get('user');
  assert.equal(typeof item.text, 'string');
  assert.equal(item.text.length > 0, true);
});
