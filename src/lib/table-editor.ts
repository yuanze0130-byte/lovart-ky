export interface ParsedTable {
  columns: string[];
  rows: string[][];
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === '\t') return line.split('\t').map((cell) => cell.trim());
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizeRows(columns: string[], rows: string[][]): ParsedTable {
  const width = Math.max(1, columns.length, ...rows.map((row) => row.length));
  return {
    columns: Array.from({ length: width }, (_, index) => columns[index]?.trim() || `#${index + 1}`),
    rows: rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || '')),
  };
}

function splitMarkdownLine(line: string) {
  const source = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  const cells: string[] = [];
  let value = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      value += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(value.trim().replace(/<br\s*\/?\s*>/gi, '\n'));
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim().replace(/<br\s*\/?\s*>/gi, '\n'));
  return cells;
}

export function parseTableContent(value: string): ParsedTable {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { columns: ['#'], rows: [['']] };

  const markdownLines = lines.filter((line) => line.includes('|'));
  if (markdownLines.length >= 2) {
    const parsed = markdownLines.map(splitMarkdownLine);
    const separatorIndex = parsed.findIndex((row) => row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    if (separatorIndex === 1) return normalizeRows(parsed[0], parsed.slice(2));
    return normalizeRows(parsed[0], parsed.slice(1));
  }

  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : lines.some((line) => line.includes(',')) ? ',' : null;
  if (delimiter) {
    const parsed = lines.map((line) => splitDelimitedLine(line, delimiter));
    return normalizeRows(parsed[0], parsed.slice(1));
  }

  const keyValueRows = lines.map((line) => line.match(/^([^:：]{1,40})[:：]\s*(.+)$/));
  if (keyValueRows.every(Boolean)) {
    return { columns: ['字段', '内容'], rows: keyValueRows.map((match) => [match?.[1].trim() || '', match?.[2].trim() || '']) };
  }

  return { columns: ['内容'], rows: lines.map((line) => [line]) };
}

export function tableToMarkdown(columns: string[], rows: string[][]) {
  const safeColumns = columns.length > 0 ? columns : ['#'];
  const escape = (value: string) => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [
    `| ${safeColumns.map(escape).join(' | ')} |`,
    `| ${safeColumns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${safeColumns.map((_, index) => escape(row[index] || '')).join(' | ')} |`),
  ].join('\n');
}

export function tableToCsv(columns: string[], rows: string[][]) {
  const escape = (value: string) => {
    const text = String(value || '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}
