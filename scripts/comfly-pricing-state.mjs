import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashComflyCatalog(records, groupRatios) {
  const sortedRecords = [...records].sort((a, b) => String(a.model_name).localeCompare(String(b.model_name)));
  return createHash('sha256').update(canonical({ records: sortedRecords, groupRatios })).digest('hex');
}

export function sameSkipped(current, previous) {
  if (!Array.isArray(previous)) return false;
  const sort = (items) => items.map(canonical).sort();
  return canonical(sort(current)) === canonical(sort(previous));
}
