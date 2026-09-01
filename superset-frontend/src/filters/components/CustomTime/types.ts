export interface TimePreset {
  label: string;
  key: string;
  duration: string;
}

export interface TimeGrainOption {
  label: string;
  key: string;
  value: string;
  xAxisFormat: string;
}

export const DEFAULT_PRESETS: TimePreset[] = [
  { label: '最近7天',  key: 'last_7d',    duration: '' },
  { label: '最近30天', key: 'last_30d',   duration: '' },
  { label: '最近90天', key: 'last_90d',   duration: '' },
  { label: '本月',     key: 'this_month', duration: '' },
  { label: '本年',     key: 'this_year',  duration: '' },
  { label: '本财年',   key: 'this_fiscal_year', duration: '' },
];

export const TIME_GRAIN_OPTIONS: TimeGrainOption[] = [
  { label: '日',   key: 'day',     value: 'P1D',        xAxisFormat: '%m/%d' },
  { label: '周',   key: 'week',    value: 'P1W_SUN',    xAxisFormat: '%Y W%U' },
  { label: '月',   key: 'month',   value: 'P1M',        xAxisFormat: '%Y年%m月' },
  { label: '季度', key: 'quarter', value: 'P3M_FISCAL', xAxisFormat: '%Y Q' },
  { label: '年',   key: 'year',    value: 'P1Y',        xAxisFormat: '%Y年' },
];
