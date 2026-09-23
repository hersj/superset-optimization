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
