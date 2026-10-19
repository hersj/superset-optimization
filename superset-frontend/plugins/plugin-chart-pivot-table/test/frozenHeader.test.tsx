import { render } from 'spec/helpers/testing-library';
import { Styles } from '../src/react-pivottable/Styles';
import { freezePivotColumns } from '../src/react-pivottable/freezePivotColumns';

test('the sticky header stacking context stays above frozen body cells', () => {
  const { container } = render(
    <Styles isDashboardEditMode={false}>
      <table className="pvtTable">
        <thead>
          <tr>
            <th colSpan={2}>Metrics</th>
          </tr>
          <tr>
            <th>Date</th>
            <th>Sales</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Date value</th>
            <td>42</td>
          </tr>
        </tbody>
      </table>
    </Styles>,
  );
  const table = container.querySelector('table')!;
  freezePivotColumns(table, 2);
  const header = window.getComputedStyle(table.tHead!);
  const frozenBody = table.tBodies[0].rows[0].cells[0];
  expect(header.position).toBe('sticky');
  expect(Number(header.zIndex)).toBeGreaterThan(
    Number(frozenBody.style.zIndex),
  );
  expect(table.tHead!.rows[1].cells[0].style.left).toBe('0px');
});

test.each([1, 2, 4])(
  'the full totals row paints above body cells when %s columns are frozen',
  frozenCount => {
    const { container } = render(
      <Styles isDashboardEditMode={false}>
        <table className="pvtTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Department</th>
              <th>Metric</th>
              <th>Sales</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th rowSpan={2}>2026-10-01</th>
              <th>Department A</th>
              <th />
              <td>20</td>
              <td>5</td>
            </tr>
            <tr>
              <th>Department B</th>
              <th />
              <td>40</td>
              <td>10</td>
            </tr>
            <tr className="pvtRowTotals">
              <th className="pvtTotalLabel pvtRowTotalLabel" colSpan={3}>
                Total
              </th>
              <td className="pvtTotal pvtRowTotal">60</td>
              <td className="pvtTotal pvtRowTotal">15</td>
            </tr>
          </tbody>
        </table>
      </Styles>,
    );
    const table = container.querySelector('table')!;
    freezePivotColumns(table, frozenCount);
    const totals = table.querySelector<HTMLElement>('.pvtRowTotals')!;
    const [body] = table.tBodies[0].rows[0].cells;
    expect(window.getComputedStyle(totals).position).toBe('sticky');
    expect(Number(window.getComputedStyle(totals).zIndex)).toBeGreaterThan(
      Number(body.style.zIndex),
    );
    expect(
      Number(window.getComputedStyle(table.tHead!).zIndex),
    ).toBeGreaterThan(Number(window.getComputedStyle(totals).zIndex));
    expect(totals.querySelector('th')!.colSpan).toBe(3);
  },
);
