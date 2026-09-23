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

/** Keep the leftmost physical columns fixed without changing pivot data or sorting. */
export function freezePivotColumns(
  table: HTMLTableElement,
  requestedCount: number,
): void {
  table.querySelectorAll<HTMLElement>('[data-pivot-frozen]').forEach(cell => {
    cell.style.position = '';
    cell.style.left = '';
    cell.style.zIndex = '';
    delete cell.dataset.pivotFrozen;
  });

  const count = Math.max(0, Math.floor(requestedCount) || 0);
  if (!count) return;
  const tableLeft = table.getBoundingClientRect().left;
  const frozen: Array<{
    cell: HTMLTableCellElement;
    left: number;
    header: boolean;
  }> = [];

  for (const section of [table.tHead, ...Array.from(table.tBodies)]) {
    if (!section) continue;
    const occupiedUntil: number[] = [];
    Array.from(section.rows).forEach((row, rowIndex) => {
      let column = 0;
      for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
        const cell = row.cells[cellIndex];
        while (occupiedUntil[column] > rowIndex) column += 1;
        const end = column + cell.colSpan;
        if (column >= count) break;
        if (cell.rowSpan > 1) {
          for (let index = column; index < end; index += 1) {
            occupiedUntil[index] = rowIndex + cell.rowSpan;
          }
        }
        // A merged header crossing the freeze boundary stays scrollable.
        if (end <= count) {
          frozen.push({
            cell,
            left: cell.getBoundingClientRect().left - tableLeft,
            header: section === table.tHead,
          });
        }
        column = end;
      }
    });
  }

  frozen.forEach(({ cell, left, header }) => {
    cell.dataset.pivotFrozen = 'true';
    cell.style.position = 'sticky';
    cell.style.left = `${left}px`;
    cell.style.zIndex = header ? '4' : '2';
  });
}
