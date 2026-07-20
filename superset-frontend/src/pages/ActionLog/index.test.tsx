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
import React from 'react';
import { render, screen } from 'spec/helpers/testing-library';
import * as hooks from 'src/views/CRUD/hooks';
import ActionLogList from './index';

jest.mock('src/views/CRUD/hooks', () => ({
  ...jest.requireActual('src/views/CRUD/hooks'),
  useListViewResource: jest.fn(),
}));

jest.mock('src/components/MessageToasts/withToasts', () => ({
  useToasts: () => ({
    addDangerToast: jest.fn(),
    addSuccessToast: jest.fn(),
  }),
}));

jest.mock('src/features/home/SubMenu', () => () => <div data-testid="submenu" />);

jest.mock('src/features/groups/utils', () => ({
  fetchUserOptions: jest.fn(),
}));

let capturedListViewProps: any;

jest.mock('src/components/ListView', () => {
  const actual = jest.requireActual('src/components/ListView');
  return {
    ...actual,
    ListView: (props: any) => {
      capturedListViewProps = props;
      const dttmColumn = props.columns.find(
        (column: any) => column.id === 'dttm' || column.accessor === 'dttm',
      );
      return (
        <div data-testid="action-log-list-view">
          {dttmColumn.Cell({ row: { original: props.data[0] } })}
        </div>
      );
    },
  };
});

beforeEach(() => {
  capturedListViewProps = undefined;
  (hooks.useListViewResource as jest.Mock).mockReturnValue({
    state: {
      loading: false,
      resourceCount: 1,
      resourceCollection: [
        {
          action: 'welcome',
          dttm: '2026-06-03 12:45:40.238192',
          user: { username: 'admin', first_name: 'Admin', last_name: 'User' },
        },
      ],
      bulkSelectEnabled: false,
    },
    fetchData: jest.fn(),
    refreshData: jest.fn(),
    toggleBulkSelect: jest.fn(),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('renders action log timestamps in Beijing time', () => {
  render(<ActionLogList />, {
    useRedux: true,
    useRouter: true,
    useQueryParams: true,
  });

  expect(screen.getByText('2026-06-03 20:45:40')).toBeInTheDocument();
});

test('keeps the dttm filter as an ISO datetime range', () => {
  render(<ActionLogList />, {
    useRedux: true,
    useRouter: true,
    useQueryParams: true,
  });

  const dttmFilter = capturedListViewProps.filters.find(
    (filter: any) => filter.id === 'dttm',
  );

  expect(dttmFilter).toMatchObject({
    input: 'datetime_range',
    operator: 'between',
    dateFilterValueType: 'iso',
  });
});
