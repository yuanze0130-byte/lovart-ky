'use client';

export function renderTableImage(columns: string[], rows: string[][]) {
  if (!columns.length || !rows.length) throw new Error('请先生成或填写表格');
  if (columns.length > 20 || rows.length > 100) throw new Error('导出图片最多支持 20 列、100 行');
  if ([columns, ...rows].some((row) => row.some((cell) => cell.length > 4000))
    || [columns, ...rows].reduce((sum, row) => sum + row.join('').length, 0) > 80000) throw new Error('表格文字过长，请缩短内容后再导出图片');
  const width = columns.length * 220;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持图片导出');
  context.font = '16px sans-serif';
  const wrap = (value: string) => {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = '';
      for (const character of paragraph) {
        if (context.measureText(line + character).width > 192 && line) { lines.push(line); line = ''; }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  };
  const wrapped = [columns, ...rows].map((row) => columns.map((_, index) => wrap(row[index] || '')));
  const heights = wrapped.map((row) => Math.max(...row.map((cell) => cell.length)) * 24 + 24);
  const height = heights.reduce((sum, item) => sum + item, 0);
  if (height > 8192 || width * height > 20_000_000) throw new Error('表格图片过大，请减少行数或缩短单元格文字后重试');
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  context.font = '16px sans-serif'; context.textBaseline = 'top'; context.lineWidth = 1;
  let y = 0;
  wrapped.forEach((row, rowIndex) => {
    row.forEach((lines, columnIndex) => {
      const x = columnIndex * 220;
      context.fillStyle = rowIndex === 0 ? '#eef2ff' : '#ffffff';
      context.fillRect(x, y, 220, heights[rowIndex]);
      context.strokeStyle = '#cbd5e1'; context.strokeRect(x + 0.5, y + 0.5, 219, heights[rowIndex] - 1);
      context.fillStyle = '#0f172a';
      lines.forEach((line, lineIndex) => context.fillText(line, x + 14, y + 12 + lineIndex * 24));
    });
    y += heights[rowIndex];
  });
  return { content: canvas.toDataURL('image/png'), width, height };
}
