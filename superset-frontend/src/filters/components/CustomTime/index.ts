import { t } from '@apache-superset/core/translation';
import { Behavior, ChartMetadata, ChartPlugin } from '@superset-ui/core';
import buildQuery from '../TimeColumn/buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

export default class CustomTimeFilterPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      name: t('Custom Time Filter'),
      description: t('Time filter with presets, date range picker, and time grain selector'),
      behaviors: [Behavior.InteractiveChart, Behavior.NativeFilter],
      tags: [t('Experimental')],
      datasourceCount: 1,
    });
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('./CustomTimeFilterPlugin'),
      metadata,
      transformProps,
    });
  }
}
