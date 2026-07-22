import {
  buildMetricDescriptors,
  getMetricId,
  reconcileMetricLayout,
} from '../src/metricLayout';

describe('personal column template metric identities', () => {
  it('uses saved metric_name and persisted adhoc optionName rather than labels', () => {
    const adhoc = {
      optionName: 'metric_cost_v1',
      label: '用户可见成本',
      expressionType: 'SQL',
      sqlExpression: 'SUM(cost)',
    };

    expect(getMetricId('total_sales' as any)).toBe('total_sales');
    expect(getMetricId(adhoc as any)).toBe('metric_cost_v1');
    expect(
      buildMetricDescriptors(['total_sales', adhoc] as any).map(x => x.id),
    ).toEqual(['total_sales', 'metric_cost_v1']);
  });

  it('keeps metrics absent from a historical template hidden', () => {
    const metrics = buildMetricDescriptors([
      'sales',
      'profit',
      'new_cost',
    ] as any);
    const result = reconcileMetricLayout(metrics, {
      version: 1,
      ordered_metric_ids: ['profit', 'sales'],
      hidden_metric_ids: [],
    });

    expect(result.orderedMetricIds).toEqual(['profit', 'sales']);
    expect(result.visibleMetrics.map(metric => metric.id)).toEqual([
      'profit',
      'sales',
    ]);
  });

  it('reads pre-template JSON identities once and normalizes them to optionName', () => {
    const metric = {
      optionName: 'metric_cost_v1',
      label: 'New label',
      expressionType: 'SQL',
      sqlExpression: 'SUM(cost)',
    };
    const legacyId =
      '{"expressionType":"SQL","sqlExpression":"SUM(cost)","type":"adhoc"}';
    const result = reconcileMetricLayout(
      buildMetricDescriptors([metric] as any),
      {
        version: 1,
        ordered_metric_ids: [legacyId],
        hidden_metric_ids: [],
      },
    );

    expect(result.orderedMetricIds).toEqual(['metric_cost_v1']);
    expect(result.visibleMetrics.map(item => item.id)).toEqual([
      'metric_cost_v1',
    ]);
  });
});
