const SQRT3 = Math.sqrt(3);

// origin (originX, originY) is the pixel center of the bottom-left hex (row=0, col=0).
// Rows increase upward; cols increase rightward.
export function hexToPixel(
  row: number,
  col: number,
  size: number,
  originX: number,
  originY: number,
): [number, number] {
  const x = originX + col * size * 1.5;
  const y = originY - row * size * SQRT3 - (col % 2 === 1 ? (size * SQRT3) / 2 : 0);
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
): { width: number; height: number; viewBox: string } {
  const H = size * SQRT3;
  const pad = size;
  const minX = originX - size - pad;
  const maxX = originX + (cols - 1) * size * 1.5 + size + pad;
  // Topmost hex center: row=rows-1, odd col adds -H/2
  const minY = originY - (rows - 1) * H - H / 2 - pad;
  // Bottommost hex center: row=0, extends +H/2 downward
  const maxY = originY + H / 2 + pad;
  const width = maxX - minX;
  const height = maxY - minY;
  return { width, height, viewBox: `${minX} ${minY} ${width} ${height}` };
}
