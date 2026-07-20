export type DimensionLabelConfig = Record<string, unknown>;

export function getDimensionLabelOverrides(
  config: DimensionLabelConfig | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config ?? {}).flatMap(([column, value]) => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('customColumnName' in value) ||
        typeof value.customColumnName !== 'string'
      ) {
        return [];
      }

      const label = value.customColumnName.trim();
      return label ? [[column, label]] : [];
    }),
  );
}
