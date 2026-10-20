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
import { t } from '@apache-superset/core/translation';
import { Select, Tooltip } from '@superset-ui/core/components';
import { sharedControls, DEFAULT_MAX_ROW } from '@superset-ui/chart-controls';
import { useSelector } from 'react-redux';
import type { RootState } from 'src/dashboard/types';

export default function ChartRowLimitControl({
  value,
  defaultValue,
  disabled,
  onChange,
}: {
  value?: number;
  defaultValue: number;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const maxRows = useSelector(
    (state: RootState) =>
      state.dashboardInfo.common?.conf?.SQL_MAX_ROW ?? DEFAULT_MAX_ROW,
  );
  const choices = sharedControls.row_limit.choices as [number, string][];
  const limits = [
    ...new Set([
      ...choices.map(([limit]) => limit),
      maxRows,
      ...(value ? [value] : []),
    ]),
  ]
    .filter(limit => Number.isInteger(limit) && limit > 0 && limit <= maxRows)
    .sort((a, b) => a - b);
  return (
    <Tooltip title={t('限制图表查询的行数，选择后自动记住。')}>
      <Select<number | 'default'>
        aria-label={t('行限制')}
        size="small"
        sortComparator={() => 0}
        style={{ width: 150, marginRight: 4 }}
        value={value ?? 'default'}
        disabled={disabled}
        onChange={limit => onChange(limit === 'default' ? null : Number(limit))}
        options={[
          { value: 'default', label: t('行限制：默认 (%s)', defaultValue) },
          ...limits.map(limit => ({
            value: limit,
            label: t('行限制：%s', limit),
          })),
        ]}
      />
    </Tooltip>
  );
}
