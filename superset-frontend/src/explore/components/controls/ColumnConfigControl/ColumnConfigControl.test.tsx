/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import { GenericDataType } from '@apache-superset/core/common';
import ColumnConfigControl from './ColumnConfigControl';

test('search, visibility, keyboard ordering and bulk format preserve old configs', () => {
  const onChange = jest.fn();
  const colnames = ['shop', 'Main sales', '# sales'];
  render(
    <ColumnConfigControl
      enableColumnManager
      name="column_config"
      label="列设置"
      onChange={onChange}
      columnsPropsObject={{
        colnames,
        coltypes: [
          GenericDataType.String,
          GenericDataType.Numeric,
          GenericDataType.Numeric,
        ],
      }}
      value={{
        hidden_metric: { d3NumberFormat: '.2%' },
        '主项 sales': { customColumnName: '收入', d3NumberFormat: 'CN_WAN' },
      }}
    />,
  );
  fireEvent.click(screen.getByLabelText('显示 Main sales'));
  expect(onChange.mock.lastCall[0]['Main sales']).toMatchObject({
    visible: false,
    customColumnName: '收入',
  });
  expect(onChange.mock.lastCall[0].hidden_metric).toEqual({
    d3NumberFormat: '.2%',
  });
  fireEvent.click(screen.getByLabelText('上移 Main sales'));
  expect(onChange.mock.lastCall[0]['Main sales'].displayOrder).toBe(0);
  expect(colnames).toEqual(['shop', 'Main sales', '# sales']);
  fireEvent.change(screen.getByLabelText('搜索列'), {
    target: { value: 'sales' },
  });
  expect(screen.queryByLabelText('显示 shop')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('选择搜索结果'));
  fireEvent.change(screen.getByLabelText('批量数字格式'), {
    target: { value: 'CN_WANYI' },
  });
  expect(onChange.mock.lastCall[0]['Main sales'].d3NumberFormat).toBe(
    'CN_WANYI',
  );
  expect(onChange.mock.lastCall[0]['# sales'].d3NumberFormat).toBe('CN_WANYI');
  expect(onChange.mock.lastCall[0].shop?.d3NumberFormat).toBeUndefined();
});
