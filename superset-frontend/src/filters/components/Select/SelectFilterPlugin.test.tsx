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
import { AppSection, DataMask } from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { useState } from 'react';
import {
  render,
  screen,
  userEvent,
  fireEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import { NULL_STRING } from 'src/utils/common';
import SelectFilterPlugin from './SelectFilterPlugin';
import transformProps from './transformProps';

jest.useFakeTimers();

const selectMultipleProps = {
  formData: {
    sortAscending: true,
    allowFuzzyMatch: false,
    creatable: false,
    multiSelect: true,
    enableEmptyFilter: true,
    defaultToFirstItem: false,
    inverseSelection: false,
    searchAllOptions: false,
    datasource: '3__table',
    groupby: ['gender'],
    adhocFilters: [],
    extraFilters: [],
    extraFormData: {},
    granularitySqla: 'ds',
    metrics: ['count'],
    rowLimit: 1000,
    showSearch: true,
    defaultValue: ['boy'],
    timeRangeEndpoints: ['inclusive', 'exclusive'],
    urlParams: {},
    vizType: 'filter_select',
    inputRef: { current: null },
    nativeFilterId: 'test-filter',
  },
  height: 20,
  width: 220,
  hooks: {},
  ownState: {},
  filterState: { value: ['boy'] },
  queriesData: [
    {
      rowcount: 2,
      colnames: ['gender'],
      coltypes: [1],
      data: [{ gender: 'boy' }, { gender: 'girl' }, { gender: null }],
      applied_filters: [{ column: 'gender' }],
      rejected_filters: [],
    },
  ],
  behaviors: ['NATIVE_FILTER'],
  isRefreshing: false,
  appSection: AppSection.Dashboard,
};

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('SelectFilterPlugin', () => {
  const setDataMask = jest.fn();
  const getWrapper = (props = {}, appSection = AppSection.Dashboard) =>
    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps({
          ...selectMultipleProps,
          appSection,
          formData: { ...selectMultipleProps.formData, ...props },
        })}
        setDataMask={setDataMask}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {
                filters: [
                  {
                    col: 'gender',
                    op: 'IN',
                    val: ['boy'],
                  },
                ],
              },
              filterState: {
                value: ['boy'],
                label: 'boy',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Add multiple values with first render', async () => {
    getWrapper();
    expect(setDataMask).toHaveBeenCalledWith({
      extraFormData: {
        filters: [
          {
            col: 'gender',
            op: 'IN',
            val: ['boy'],
          },
        ],
      },
      filterState: {
        label: 'boy',
        value: ['boy'],
        excludeFilterValues: true,
      },
    });

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'girl' }));
    expect(setDataMask).toHaveBeenCalledWith({
      extraFormData: {
        filters: [
          {
            col: 'gender',
            op: 'IN',
            val: ['boy', 'girl'],
          },
        ],
      },
      filterState: {
        label: 'boy, girl',
        value: ['boy', 'girl'],
        excludeFilterValues: true,
        valueSelection: true,
        searchValue: '',
      },
    });
  });

  test('Remove multiple values when required', () => {
    getWrapper();
    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(screen.getByRole('button', { name: '取消全选' }));
    expect(setDataMask).toHaveBeenCalledWith({
      extraFormData: {
        adhoc_filters: [
          {
            clause: 'WHERE',
            expressionType: 'SQL',
            sqlExpression: '1 = 0',
          },
        ],
      },
      filterState: {
        label: undefined,
        value: null,
        excludeFilterValues: true,
        valueSelection: true,
        searchValue: '',
      },
    });
  });

  test('Remove multiple values when not required', () => {
    getWrapper({ enableEmptyFilter: false });
    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(screen.getByRole('button', { name: '取消全选' }));
    expect(setDataMask).toHaveBeenCalledWith({
      extraFormData: {},
      filterState: {
        label: undefined,
        value: null,
        excludeFilterValues: true,
        valueSelection: true,
        searchValue: '',
      },
    });
  });

  test('Select single values with inverse', async () => {
    getWrapper({ multiSelect: false, inverseSelection: true });

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'girl' }));
    expect(setDataMask).toHaveBeenCalledWith({
      extraFormData: {
        filters: [
          {
            col: 'gender',
            op: 'NOT IN',
            val: ['girl'],
          },
        ],
      },
      filterState: {
        label: 'girl (excluded)',
        value: ['girl'],
        excludeFilterValues: true,
        valueSelection: true,
        searchValue: '',
      },
    });
  });

  test('Select single null (empty) value', async () => {
    getWrapper();
    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: NULL_STRING }));
    expect(setDataMask).toHaveBeenLastCalledWith({
      extraFormData: {
        filters: [
          {
            col: 'gender',
            op: 'IN',
            val: ['boy', null],
          },
        ],
      },
      filterState: {
        label: `boy, ${NULL_STRING}`,
        value: ['boy', null],
        excludeFilterValues: true,
        valueSelection: true,
        searchValue: '',
      },
    });
  });

  test('receives the correct filter when search all options', async () => {
    getWrapper({ searchAllOptions: true, multiSelect: false });
    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'girl' }));
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [
            {
              col: 'gender',
              op: 'IN',
              val: ['girl'],
            },
          ],
        },
      }),
    );
  });

  test('searching options preserves selections and debounces the option query', async () => {
    getWrapper({ searchAllOptions: true });
    const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    expect(
      setDataMask.mock.calls.filter(([mask]) => mask.ownState?.search === 'a'),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(setDataMask).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ownState: expect.objectContaining({ search: 'a' }),
          filterState: expect.objectContaining({
            value: ['boy'],
            searchValue: 'a',
          }),
        }),
      ),
    );
    expect(
      setDataMask.mock.calls.filter(([mask]) => mask.ownState?.search === 'a'),
    ).toHaveLength(1);
  });

  test('Select big int value', async () => {
    const bigValue = 1100924931345932234n;
    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps({
          ...selectMultipleProps,
          formData: { ...selectMultipleProps.formData, groupby: 'bval' },
        })}
        coltypeMap={{ bval: GenericDataType.Numeric }}
        data={[{ bval: bigValue }]}
        setDataMask={jest.fn()}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {},
              filterState: {
                value: [],
                label: '',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );
    const filterSelect = screen.getAllByRole('combobox')[0];
    userEvent.click(filterSelect);
    expect(
      await screen.findByRole('combobox', { name: 'test-filter' }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('combobox', { name: 'test-filter' }),
      '1',
    );
    expect(
      await screen.findByRole('option', { name: String(bigValue) }),
    ).toBeInTheDocument();
  });

  test('Is/Is Not select is visible when inverseSelection is true', () => {
    getWrapper({ inverseSelection: true });
    expect(screen.getByText('is not')).toBeInTheDocument();
  });

  test('Is/Is Not select is not visible when inverseSelection is false', () => {
    getWrapper({ inverseSelection: false });
    expect(screen.queryByText('is not')).not.toBeInTheDocument();
  });

  test('Is/Is Not select toggles correctly', async () => {
    getWrapper({ inverseSelection: true });

    const isNotSelect = screen.getByText('is not');
    expect(isNotSelect).toBeInTheDocument();

    // Click to open dropdown
    userEvent.click(isNotSelect);

    // Click "is" option
    userEvent.click(screen.getByText('is'));

    // Should update excludeFilterValues to false
    expect(setDataMask).toHaveBeenCalledWith(
      expect.objectContaining({
        filterState: expect.objectContaining({
          excludeFilterValues: false,
        }),
      }),
    );
  });

  test('Should not allow for new values when creatable is false', () => {
    getWrapper({ creatable: false }, AppSection.FilterConfigModal);
    userEvent.type(
      screen.getByRole('combobox', { name: 'test-filter' }),
      'new value',
    );
    expect(screen.queryByTitle('new value')).not.toBeInTheDocument();
  });

  test('Should allow for new values when creatable is true', async () => {
    getWrapper({ creatable: true }, AppSection.FilterConfigModal);
    userEvent.type(
      screen.getByRole('combobox', { name: 'test-filter' }),
      'new value',
    );
    expect(await screen.findByTitle('new value')).toBeInTheDocument();
  });

  test('preserves backend order when sortMetric is specified', () => {
    const testData = [
      { gender: 'zebra' },
      { gender: 'alpha' },
      { gender: 'beta' },
    ];

    const testProps = {
      ...selectMultipleProps,
      formData: {
        ...selectMultipleProps.formData,
        sortMetric: 'count',
        sortAscending: true,
      },
      queriesData: [
        {
          rowcount: 3,
          colnames: ['gender'],
          coltypes: [1],
          data: testData,
          applied_filters: [{ column: 'gender' }],
          rejected_filters: [],
        },
      ],
      filterState: {
        value: [],
        label: '',
        excludeFilterValues: true,
      },
    };

    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps(testProps)}
        setDataMask={jest.fn()}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {},
              filterState: {
                value: [],
                label: '',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));

    // When sortMetric is specified, options should appear in the original data order
    // (zebra, alpha, beta) not alphabetically sorted
    const options = screen.getAllByRole('checkbox');
    expect(options[0]).toHaveAccessibleName('zebra');
    expect(options[1]).toHaveAccessibleName('alpha');
    expect(options[2]).toHaveAccessibleName('beta');
  });

  test('applies alphabetical sorting when sortMetric is not specified', () => {
    const testData = [
      { gender: 'zebra' },
      { gender: 'alpha' },
      { gender: 'beta' },
    ];

    const testProps = {
      ...selectMultipleProps,
      formData: {
        ...selectMultipleProps.formData,
        sortMetric: undefined,
        sortAscending: true,
      },
      queriesData: [
        {
          rowcount: 3,
          colnames: ['gender'],
          coltypes: [1],
          data: testData,
          applied_filters: [{ column: 'gender' }],
          rejected_filters: [],
        },
      ],
      filterState: {
        value: [],
        label: '',
        excludeFilterValues: true,
      },
    };

    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps(testProps)}
        setDataMask={jest.fn()}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {},
              filterState: {
                value: [],
                label: '',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));

    // When sortMetric is not specified, options should be sorted alphabetically
    // (alpha, beta, zebra)
    const options = screen.getAllByRole('checkbox');
    expect(options[0]).toHaveAccessibleName('alpha');
    expect(options[1]).toHaveAccessibleName('beta');
    expect(options[2]).toHaveAccessibleName('zebra');
  });

  test('applies descending alphabetical sorting when sortAscending is false and no sortMetric', () => {
    const testData = [
      { gender: 'zebra' },
      { gender: 'alpha' },
      { gender: 'beta' },
    ];

    const testProps = {
      ...selectMultipleProps,
      formData: {
        ...selectMultipleProps.formData,
        sortMetric: undefined,
        sortAscending: false,
      },
      queriesData: [
        {
          rowcount: 3,
          colnames: ['gender'],
          coltypes: [1],
          data: testData,
          applied_filters: [{ column: 'gender' }],
          rejected_filters: [],
        },
      ],
      filterState: {
        value: [],
        label: '',
        excludeFilterValues: true,
      },
    };

    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps(testProps)}
        setDataMask={jest.fn()}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {},
              filterState: {
                value: [],
                label: '',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));

    // When sortAscending is false and no sortMetric, options should be sorted
    // in descending alphabetical order (zebra, beta, alpha)
    const options = screen.getAllByRole('checkbox');
    expect(options[0]).toHaveAccessibleName('zebra');
    expect(options[1]).toHaveAccessibleName('beta');
    expect(options[2]).toHaveAccessibleName('alpha');
  });

  test('preserves backend order even when sortAscending is false and sortMetric is specified', () => {
    const testData = [
      { gender: 'zebra' },
      { gender: 'alpha' },
      { gender: 'beta' },
    ];

    const testProps = {
      ...selectMultipleProps,
      formData: {
        ...selectMultipleProps.formData,
        sortMetric: 'count',
        sortAscending: false,
      },
      queriesData: [
        {
          rowcount: 3,
          colnames: ['gender'],
          coltypes: [1],
          data: testData,
          applied_filters: [{ column: 'gender' }],
          rejected_filters: [],
        },
      ],
      filterState: {
        value: [],
        label: '',
        excludeFilterValues: true,
      },
    };

    render(
      // @ts-expect-error
      <SelectFilterPlugin
        // @ts-expect-error
        {...transformProps(testProps)}
        setDataMask={jest.fn()}
        showOverflow={false}
      />,
      {
        useRedux: true,
        initialState: {
          nativeFilters: {
            filters: {
              'test-filter': {
                name: 'Test Filter',
              },
            },
          },
          dataMask: {
            'test-filter': {
              extraFormData: {},
              filterState: {
                value: [],
                label: '',
                excludeFilterValues: true,
              },
            },
          },
        },
      },
    );

    fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));

    // When sortMetric is specified, original order should be preserved regardless
    // of sortAscending value (zebra, alpha, beta)
    const options = screen.getAllByRole('checkbox');
    expect(options[0]).toHaveAccessibleName('zebra');
    expect(options[1]).toHaveAccessibleName('alpha');
    expect(options[2]).toHaveAccessibleName('beta');
  });
});

test('Select boolean FALSE value in single-select mode', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: false,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: undefined },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: undefined,
            },
          },
        },
      },
    },
  );

  const filterSelect = screen.getByRole('combobox', { name: 'test-filter' });
  userEvent.click(filterSelect);

  const falseOption = await screen.findByRole('option', { name: /false/i });
  userEvent.click(falseOption);

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [
            {
              col: 'is_active',
              op: 'IN',
              val: [false],
            },
          ],
        },
        filterState: expect.objectContaining({
          value: [false],
        }),
      }),
    );
  });
});

test('Select boolean TRUE value in single-select mode', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: false,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: undefined },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: undefined,
            },
          },
        },
      },
    },
  );

  const filterSelect = screen.getByRole('combobox', { name: 'test-filter' });
  userEvent.click(filterSelect);

  const trueOption = await screen.findByRole('option', { name: /true/i });
  userEvent.click(trueOption);

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [
            {
              col: 'is_active',
              op: 'IN',
              val: [true],
            },
          ],
        },
        filterState: expect.objectContaining({
          value: [true],
        }),
      }),
    );
  });
});

test('Select both boolean values in multi-select mode', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: true,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: [true] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: [true],
            },
          },
        },
      },
    },
  );

  const filterSelect = screen.getByRole('combobox', { name: 'test-filter' });
  userEvent.click(filterSelect);

  const falseOption = await screen.findByRole('option', { name: /false/i });
  userEvent.click(falseOption);

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [
            {
              col: 'is_active',
              op: 'IN',
              val: [true, false],
            },
          ],
        },
        filterState: expect.objectContaining({
          value: [true, false],
        }),
      }),
    );
  });
});

test('Select boolean filter with null values', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: true,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }, { is_active: null }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: [false] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: [false],
            },
          },
        },
      },
    },
  );

  const filterSelect = screen.getByRole('combobox', { name: 'test-filter' });
  userEvent.click(filterSelect);

  const nullOption = await screen.findByRole('option', { name: NULL_STRING });
  userEvent.click(nullOption);

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [
            {
              col: 'is_active',
              op: 'IN',
              val: [false, null],
            },
          ],
        },
        filterState: expect.objectContaining({
          value: [false, null],
        }),
      }),
    );
  });
});

test('Clear boolean FALSE value', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: false,
      enableEmptyFilter: false,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: [false] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: [false],
            },
          },
        },
      },
    },
  );

  userEvent.click(
    screen.getByRole('img', {
      name: /close-circle/i,
      hidden: true,
    }),
  );

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith({
      extraFormData: {},
      filterState: {
        label: undefined,
        value: null,
        excludeFilterValues: true,
      },
    });
  });
});

test('Clear boolean TRUE value', async () => {
  jest.useRealTimers();
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      multiSelect: false,
      enableEmptyFilter: false,
      groupby: ['is_active'],
    },
    queriesData: [
      {
        ...selectMultipleProps.queriesData[0],
        colnames: ['is_active'],
        coltypes: [GenericDataType.Boolean],
        data: [{ is_active: true }, { is_active: false }],
        applied_filters: [{ column: 'is_active' }],
      },
    ],
    filterState: { value: [true] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: [true],
            },
          },
        },
      },
    },
  );

  userEvent.click(
    screen.getByRole('img', {
      name: /close-circle/i,
      hidden: true,
    }),
  );

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenCalledWith({
      extraFormData: {},
      filterState: {
        label: undefined,
        value: null,
        excludeFilterValues: true,
      },
    });
  });
});

test('preserves dependent filter value restored from URL when it exists in data', async () => {
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      defaultToFirstItem: true,
      multiSelect: false,
      // Non-empty extraFormData indicates parent filter dependency
      extraFormData: {
        filters: [{ col: 'region', op: 'IN', val: ['North America'] }],
      },
    },
    // 'girl' is NOT the first item but exists in data — simulates a
    // value restored from URL/permalink for a dependent filter
    filterState: { value: ['girl'] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: ['girl'],
            },
          },
        },
      },
    },
  );

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filterState: expect.objectContaining({
          value: ['girl'],
        }),
      }),
    );
  });
});

test('resets dependent filter to first item when value does not exist in data', async () => {
  const setDataMaskMock = jest.fn();
  const testProps = {
    ...selectMultipleProps,
    formData: {
      ...selectMultipleProps.formData,
      defaultToFirstItem: true,
      multiSelect: false,
      extraFormData: {
        filters: [{ col: 'region', op: 'IN', val: ['North America'] }],
      },
    },
    // 'unknown' does NOT exist in data — simulates a stale value after
    // parent filter changed to a different selection
    filterState: { value: ['unknown'] },
  };

  render(
    // @ts-expect-error
    <SelectFilterPlugin
      // @ts-expect-error
      {...transformProps(testProps)}
      setDataMask={setDataMaskMock}
      showOverflow={false}
    />,
    {
      useRedux: true,
      initialState: {
        nativeFilters: {
          filters: {
            'test-filter': {
              name: 'Test Filter',
            },
          },
        },
        dataMask: {
          'test-filter': {
            extraFormData: {},
            filterState: {
              value: ['unknown'],
            },
          },
        },
      },
    },
  );

  await waitFor(() => {
    expect(setDataMaskMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filterState: expect.objectContaining({
          // Should reset to first item ('boy') since 'unknown' is not in data
          value: ['boy'],
        }),
      }),
    );
  });
});

function ControlledMatchFilter({
  saved,
  names,
  allowFuzzyMatch = true,
  setDataMask = jest.fn(),
}: {
  saved?: DataMask['filterState'];
  names?: string[];
  allowFuzzyMatch?: boolean;
  setDataMask?: (mask: DataMask) => void;
}) {
  const [filterState, setFilterState] = useState(saved ?? { value: null });
  const props = transformProps({
    ...selectMultipleProps,
    ...(names
      ? {
          queriesData: [
            {
              ...selectMultipleProps.queriesData[0],
              data: names.map(gender => ({ gender })),
              rowcount: names.length,
            },
          ],
        }
      : {}),
    filterState,
    formData: {
      ...selectMultipleProps.formData,
      allowFuzzyMatch,
      enableEmptyFilter: false,
      defaultValue: null,
    },
  });
  return (
    <SelectFilterPlugin
      {...props}
      showOverflow={false}
      setDataMask={mask => {
        setDataMask(mask);
        setFilterState(mask.filterState);
      }}
    />
  );
}

test('restores an old contains keyword without converting it into an exact name', async () => {
  const setDataMask = jest.fn();
  render(
    <ControlledMatchFilter
      saved={{ value: ['深圳'], matchMode: 'contains' }}
      setDataMask={setDataMask}
    />,
  );
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    '深圳',
  );
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'ILIKE', val: '%深圳%' }],
        },
      }),
    ),
  );
});

test('keeps Chinese composition local and saves only the committed search value', async () => {
  const setDataMask = jest.fn();
  render(
    <ControlledMatchFilter
      saved={{
        value: ['boy'],
        matchMode: 'contains',
        valueSelection: true,
        searchValue: '',
      }}
      setDataMask={setDataMask}
    />,
  );
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  fireEvent.focus(input);
  setDataMask.mockClear();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'shenzhen' } });
  expect(input).toHaveValue('shenzhen');
  expect(setDataMask).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '深圳' } });
  fireEvent.compositionEnd(input, { data: '深圳' });
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'ILIKE', val: '%深圳%' }],
        },
        filterState: expect.objectContaining({
          searchValue: '深圳',
          value: ['深圳'],
          valueSelection: false,
        }),
      }),
    ),
  );
  expect(
    setDataMask.mock.calls.every(
      ([mask]) => !JSON.stringify(mask.filterState).includes('shenzhen'),
    ),
  ).toBe(true);
});

test('explicit contains selections retain their exact values after remount and disable', async () => {
  const saved = {
    value: ['深圳科技'],
    matchMode: 'contains',
    valueSelection: true,
    searchValue: '深圳',
  };
  const setDataMask = jest.fn();
  const view = render(
    <ControlledMatchFilter saved={saved} setDataMask={setDataMask} />,
  );
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'IN', val: ['深圳科技'] }],
        },
        filterState: expect.objectContaining(saved),
      }),
    ),
  );
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    '深圳',
  );
  view.unmount();
  render(
    <ControlledMatchFilter
      saved={saved}
      allowFuzzyMatch={false}
      setDataMask={setDataMask}
    />,
  );
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'IN', val: ['深圳科技'] }],
        },
        filterState: expect.objectContaining({
          value: ['深圳科技'],
          matchMode: 'exact',
          searchValue: '深圳',
          valueSelection: true,
        }),
      }),
    ),
  );
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    '深圳',
  );
  expect(screen.queryByLabelText('匹配方式：gender')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '匹配方式：gender' }),
  ).not.toBeInTheDocument();
});

test('disabled contains mode keeps old exact selections and immediate named multiselect', async () => {
  const setDataMask = jest.fn();
  const view = render(
    <ControlledMatchFilter
      allowFuzzyMatch={false}
      saved={{ value: ['boy'] }}
      setDataMask={setDataMask}
    />,
  );
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  fireEvent.focus(input);
  expect(await screen.findByRole('checkbox', { name: 'boy' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'girl' }));
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'IN', val: ['boy', 'girl'] }],
        },
        filterState: expect.objectContaining({
          value: ['boy', 'girl'],
          valueSelection: true,
        }),
      }),
    ),
  );
  fireEvent.change(input, { target: { value: 'bo' } });
  const saved =
    setDataMask.mock.calls[setDataMask.mock.calls.length - 1][0].filterState;
  view.unmount();
  render(
    <ControlledMatchFilter
      allowFuzzyMatch={false}
      saved={saved}
      setDataMask={setDataMask}
    />,
  );
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    'bo',
  );
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'IN', val: ['boy', 'girl'] }],
        },
        filterState: expect.objectContaining({
          searchValue: 'bo',
          value: ['boy', 'girl'],
        }),
      }),
    ),
  );
});

test('empty text option results keep the named panel and the remembered selection', () => {
  const props = transformProps({
    ...selectMultipleProps,
    queriesData: [
      { ...selectMultipleProps.queriesData[0], data: [], rowcount: 0 },
    ],
  });
  const setDataMask = jest.fn();
  render(
    <SelectFilterPlugin
      {...props}
      showOverflow={false}
      setDataMask={setDataMask}
    />,
  );
  fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
  expect(screen.getByRole('status')).toHaveTextContent('无匹配项');
  expect(setDataMask).toHaveBeenLastCalledWith(
    expect.objectContaining({
      filterState: expect.objectContaining({ value: ['boy'] }),
    }),
  );
});

test('matching mode stays in the filter title and clear all clears remembered search', () => {
  const props = transformProps({
    ...selectMultipleProps,
    formData: { ...selectMultipleProps.formData, allowFuzzyMatch: true },
    filterState: {
      value: ['boy'],
      matchMode: 'contains',
      valueSelection: true,
      searchValue: 'bo',
    },
  });
  const heading = document.createElement('span');
  document.body.appendChild(heading);
  const view = render(
    <SelectFilterPlugin
      {...props}
      matchModeContainer={heading}
      showOverflow={false}
    />,
  );
  expect(heading).toHaveTextContent('模糊');
  expect(
    screen
      .getByRole('button', { name: '匹配方式：gender' })
      .closest('.ant-input-affix-wrapper'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    'bo',
  );
  view.rerender(
    <SelectFilterPlugin
      {...props}
      clearAllTrigger
      matchModeContainer={heading}
      showOverflow={false}
    />,
  );
  expect(screen.getByRole('textbox', { name: '搜索选项：gender' })).toHaveValue(
    '',
  );
  heading.remove();
});

test('commits checked names as IN values while preserving the contains search mode', async () => {
  const setDataMask = jest.fn();
  render(
    <ControlledMatchFilter
      saved={{
        value: ['boy'],
        matchMode: 'contains',
        valueSelection: true,
        searchValue: '',
      }}
      setDataMask={setDataMask}
    />,
  );
  fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'girl' }));
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'IN', val: ['boy', 'girl'] }],
        },
        filterState: expect.objectContaining({
          valueSelection: true,
          matchMode: 'contains',
          value: ['boy', 'girl'],
        }),
      }),
    ),
  );
});

test('fuzzy typing selects every matching name automatically and replaces the previous selection', async () => {
  const setDataMask = jest.fn();
  const names = ['华南-US', '华南-CA', '北美-US'];
  const view = render(
    <ControlledMatchFilter
      names={names}
      saved={{ value: ['北美-US'], matchMode: 'exact' }}
      setDataMask={setDataMask}
    />,
  );
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  const mode = screen.getByRole('button', { name: '匹配方式：gender' });
  expect(mode).toHaveTextContent('精确');
  fireEvent.click(mode);
  expect(mode).toHaveTextContent('模糊');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '华南' } });
  await waitFor(() =>
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          filters: [{ col: 'gender', op: 'ILIKE', val: '%华南%' }],
        },
        filterState: expect.objectContaining({
          value: ['华南'],
          matchMode: 'contains',
          valueSelection: false,
          searchValue: '华南',
        }),
      }),
    ),
  );
  expect(screen.getByRole('checkbox', { name: '华南-US' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '华南-CA' })).toBeChecked();
  expect(
    screen.getByRole('button', { name: '展开选项：gender' }),
  ).toHaveTextContent('已选 2');
  const saved = setDataMask.mock.calls.at(-1)[0].filterState;
  view.unmount();
  const restored = render(
    <ControlledMatchFilter
      names={names}
      saved={saved}
      setDataMask={setDataMask}
    />,
  );
  fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：gender' }));
  expect(screen.getByRole('checkbox', { name: '华南-US' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '华南-CA' })).toBeChecked();
  // A refreshed option list inherits the saved predicate, including new matches.
  restored.rerender(
    <ControlledMatchFilter
      names={[...names, '华南-UK']}
      saved={saved}
      setDataMask={setDataMask}
    />,
  );
  expect(screen.getByRole('checkbox', { name: '华南-UK' })).toBeChecked();
  expect(
    screen.getByRole('button', { name: '展开选项：gender' }),
  ).toHaveTextContent('已选 3');
});

test('exact searches keep selections and switching to fuzzy applies the current keyword', async () => {
  const setDataMask = jest.fn();
  render(<ControlledMatchFilter setDataMask={setDataMask} />);
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'bo' } });
  expect(screen.getByRole('checkbox', { name: 'boy' })).not.toBeChecked();
  expect(setDataMask.mock.calls.at(-1)[0].extraFormData.filters ?? []).toEqual(
    [],
  );
  fireEvent.click(screen.getByRole('button', { name: '匹配方式：gender' }));
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toEqual({
      filters: [{ col: 'gender', op: 'ILIKE', val: '%bo%' }],
    }),
  );
  expect(screen.getByRole('checkbox', { name: 'boy' })).toBeChecked();
  expect(setDataMask.mock.calls.at(-1)[0].ownState).toEqual(
    expect.objectContaining({ search: 'bo', searchMatchMode: 'contains' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '匹配方式：gender' }));
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toEqual({
      filters: [{ col: 'gender', op: 'IN', val: ['boy'] }],
    }),
  );
  expect(
    screen.getByRole('button', { name: '匹配方式：gender' }),
  ).toHaveTextContent('精确');
});

test('no fuzzy matches keep the predicate and clearing the keyword removes it', async () => {
  const setDataMask = jest.fn();
  render(
    <ControlledMatchFilter
      saved={{ matchMode: 'contains', value: null }}
      setDataMask={setDataMask}
    />,
  );
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'not found' } });
  expect(screen.getByRole('status')).toHaveTextContent('无匹配项');
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toEqual({
      filters: [{ col: 'gender', op: 'ILIKE', val: '%not found%' }],
    }),
  );
  fireEvent.change(input, { target: { value: '' } });
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0]).toEqual(
      expect.objectContaining({
        extraFormData: {},
        filterState: expect.objectContaining({ value: null, searchValue: '' }),
      }),
    ),
  );
});

test('manual deselection overrides auto matches until the next fuzzy keyword', async () => {
  const setDataMask = jest.fn();
  render(
    <ControlledMatchFilter
      names={['华南-US', '华南-CA', '北美-US']}
      saved={{
        matchMode: 'contains',
        value: ['北美-US'],
        valueSelection: true,
      }}
      setDataMask={setDataMask}
    />,
  );
  const input = screen.getByRole('textbox', { name: '搜索选项：gender' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '华南' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: '华南-CA' }));
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toEqual({
      filters: [{ col: 'gender', op: 'IN', val: ['华南-US'] }],
    }),
  );
  fireEvent.change(input, { target: { value: '北美' } });
  await waitFor(() =>
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toEqual({
      filters: [{ col: 'gender', op: 'ILIKE', val: '%北美%' }],
    }),
  );
  expect(screen.getByRole('checkbox', { name: '北美-US' })).toBeChecked();
});
