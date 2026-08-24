const normalizeJsonValue = (value: unknown, inArray: boolean): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item, true));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) {
        result[key] = normalizeJsonValue(item, false);
      }
    }
    return result;
  }

  if (inArray) {
    return null;
  }
  return undefined;
};

export const stableStringify = (value: unknown): string => {
  const normalized = normalizeJsonValue(value, false);
  const serialized = JSON.stringify(normalized);
  return serialized ?? 'null';
};
