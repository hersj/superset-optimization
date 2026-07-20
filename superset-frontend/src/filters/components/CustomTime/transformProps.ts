import { ChartProps } from '@superset-ui/core';
import { noOp } from 'src/utils/common';

export default function transformProps(chartProps: ChartProps) {
  const {
    formData,
    height,
    hooks,
    queriesData,
    width,
    behaviors,
    filterState,
    inputRef,
    displaySettings,
  } = chartProps;

  const {
    setDataMask = noOp,
    setHoveredFilter = noOp,
    unsetHoveredFilter = noOp,
    setFocusedFilter = noOp,
    unsetFocusedFilter = noOp,
    setFilterActive = noOp,
  } = hooks;

  const data = queriesData?.[0]?.data || [];

  return {
    data,
    filterState,
    formData,
    height,
    behaviors,
    setDataMask,
    setHoveredFilter,
    unsetHoveredFilter,
    setFocusedFilter,
    unsetFocusedFilter,
    setFilterActive,
    width,
    inputRef,
    filterBarOrientation: displaySettings?.filterBarOrientation,
    isOverflowingFilterBar: displaySettings?.isOverflowingFilterBar,
  };
}
