/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { formatBigNumberPeriodComparison } from './customComparison';

test.each([
  { a: 13000, b: 31000, expected: '对比值 31000\n差额 -18000\n变化率 -58.1%' },
  { a: -50, b: -100, expected: '对比值 -100\n差额 +50\n变化率 +50.0%' },
  { a: 50, b: 0, expected: '对比值 0\n差额 +50\n变化率 —' },
])(
  'three-line summary preserves complete-period arithmetic for $a / $b',
  ({ a, b, expected }) => {
    expect(formatBigNumberPeriodComparison(a, b, String)).toBe(expected);
  },
);
