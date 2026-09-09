/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */
import {
  normalizeSelectedRanges,
  selectedRangeEnvelope,
  selectedRangesHaveGaps,
  toggleSelectedRange,
} from './selectedTimeRanges';

const a = '2025-04-27 : 2025-05-04';
const b = '2026-07-05 : 2026-07-12';

test('sorts and deduplicates without filling unselected gaps', () => {
  expect(normalizeSelectedRanges([b, a, a])).toEqual([a, b]);
  expect(selectedRangeEnvelope([b, a])).toBe('2025-04-27 : 2026-07-12');
  expect(selectedRangesHaveGaps([a, b])).toBe(true);
  expect(toggleSelectedRange([a], b)).toEqual([a, b]);
  expect(toggleSelectedRange([a, b], a)).toEqual([b]);
  expect(toggleSelectedRange([b], b)).toEqual([]);
});

test('subtracts a clicked unit from a restored continuous range', () => {
  expect(
    toggleSelectedRange(['2026-01-01 : 2026-04-01'], '2026-02-01 : 2026-03-01'),
  ).toEqual(['2026-01-01 : 2026-02-01', '2026-03-01 : 2026-04-01']);
  expect(
    selectedRangesHaveGaps([
      '2026-01-01 : 2026-02-01',
      '2026-02-01 : 2026-03-01',
    ]),
  ).toBe(false);
});

test.each([
  null,
  {},
  ['2026-02-30 : 2026-03-03'],
  ['2026-03-01 : 2026-02-01'],
  ['No filter'],
  [a, 1],
])('rejects the entire invalid selection %p', value => {
  expect(() => normalizeSelectedRanges(value)).toThrow();
});

test('empty selection is not an unbounded range', () => {
  expect(normalizeSelectedRanges([])).toEqual([]);
  expect(selectedRangeEnvelope([])).toBe('');
});
