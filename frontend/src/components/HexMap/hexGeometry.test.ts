import { describe, it, expect } from 'vitest';
import { hexToPixel, flatTopPoints, mapBounds } from './hexGeometry';

const SQRT3 = Math.sqrt(3);

describe('hexToPixel', () => {
  it('places the origin hex (row 0, col 0) exactly at the origin pixel', () => {
    expect(hexToPixel(0, 0, 10, 100, 200)).toEqual([100, 200]);
  });

  it('steps columns rightward by size * 1.5', () => {
    const [x] = hexToPixel(0, 2, 10, 100, 200);
    expect(x).toBe(100 + 2 * 10 * 1.5);
  });

  it('steps rows upward (decreasing y) by size * √3', () => {
    const [, y] = hexToPixel(3, 0, 10, 100, 200);
    expect(y).toBeCloseTo(200 - 3 * 10 * SQRT3);
  });

  it('offsets odd columns downward by half a hex height', () => {
    const [, yEven] = hexToPixel(0, 0, 10, 100, 200);
    const [, yOdd] = hexToPixel(0, 1, 10, 100, 200);
    expect(yOdd).toBeCloseTo(yEven - (10 * SQRT3) / 2);
  });

  it('does not offset even columns', () => {
    const [, y] = hexToPixel(0, 2, 10, 100, 200);
    expect(y).toBe(200);
  });
});

describe('flatTopPoints', () => {
  it('returns six comma/space-separated vertices', () => {
    const pts = flatTopPoints(0, 0, 10).split(' ');
    expect(pts).toHaveLength(6);
    pts.forEach((p) => expect(p.split(',')).toHaveLength(2));
  });

  it('starts at the rightmost vertex (angle 0 → cx+size, cy)', () => {
    const first = flatTopPoints(0, 0, 10).split(' ')[0];
    const [x, y] = first.split(',').map(Number);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
  });
});

describe('mapBounds', () => {
  it('produces a viewBox whose width/height match the returned width/height', () => {
    const { width, height, viewBox } = mapBounds(5, 5, 10, 100, 200);
    const parts = viewBox.split(' ').map(Number);
    expect(parts[2]).toBeCloseTo(width);
    expect(parts[3]).toBeCloseTo(height);
  });

  it('grows wider as columns increase', () => {
    const narrow = mapBounds(5, 3, 10, 100, 200).width;
    const wide = mapBounds(5, 8, 10, 100, 200).width;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('grows taller as rows increase', () => {
    const short = mapBounds(3, 5, 10, 100, 200).height;
    const tall = mapBounds(9, 5, 10, 100, 200).height;
    expect(tall).toBeGreaterThan(short);
  });
});
