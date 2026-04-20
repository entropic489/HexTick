const SQRT3 = Math.sqrt(3);

export function hexToPixel(
  row: number,
  col: number,
  size: number,
  originX: number,
  originY: number,
): [number, number] {
  const x = originX + col * size * 1.5;
  const y = originY + row * size * SQRT3 + (col % 2 === 1 ? (size * SQRT3) / 2 : 0);
  return [x, y];
}

export function flatTopPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

export function mapBounds(
  rows: number,
  cols: number,
  size: number,
  originX: number,
  originY: number,
): { width: number; height: number } {
  const lastX = originX + (cols - 1) * size * 1.5 + size;
  const lastY = originY + (rows - 1) * size * SQRT3 + (size * SQRT3) / 2 + size;
  return { width: lastX + size, height: lastY + size };
}
