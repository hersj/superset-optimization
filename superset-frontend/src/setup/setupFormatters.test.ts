import { getTimeFormatter, SMART_DATE_ID } from '@superset-ui/core';
import setupFormatters from './setupFormatters';

test('keeps the custom time filter smart date labels after formatter setup', () => {
  setupFormatters({}, {});

  const formatter = getTimeFormatter(SMART_DATE_ID);

  expect(formatter(new Date(Date.UTC(2026, 6, 2)))).toBe('2026-07-02');
  expect(formatter(new Date(Date.UTC(2026, 3, 1)))).toBe('2026年04月');
  expect(formatter(new Date(Date.UTC(2026, 6, 1)))).toBe('2026年07月');
  expect(formatter(new Date(Date.UTC(2026, 0, 1)))).toBe('2026年');
});
