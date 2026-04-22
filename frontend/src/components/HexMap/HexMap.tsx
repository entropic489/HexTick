import { useMemo, useRef, useState, useEffect } from 'react';
import type { Hex, Faction, Map } from '../../types';
import { HexCell } from './HexCell';
import { mapBounds, hexToPixel } from './hexGeometry';
import styles from './HexMap.module.css';

function shortenLine(
  x1: number, y1: number, x2: number, y2: number, amount: number,
): [number, number, number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < amount * 2.5) return [x1, y1, x2, y2];
  const ux = dx / len;
  const uy = dy / len;
  return [x1 + ux * amount, y1 + uy * amount, x2 - ux * amount, y2 - uy * amount];
}

interface Props {
  map: Map;
  hexes: Hex[];
  factions: Faction[];
  selectedHexId: number | null;
  fogOfWar: boolean;
  onHexClick: (hexId: number) => void;
}

const MAX_SCALE = 8;

export function HexMap({ map, hexes, factions, selectedHexId, fogOfWar, onHexClick }: Props) {
  const factionsByHex = useMemo(() => {
    const m = new Map<number, Faction[]>();
    for (const f of factions) {
      if (f.current_hex == null) continue;
      if (!m.has(f.current_hex)) m.set(f.current_hex, []);
      m.get(f.current_hex)!.push(f);
    }
    return m;
  }, [factions]);

  const rows = hexes.reduce((max, h) => Math.max(max, h.row), 0) + 1;
  const cols = hexes.reduce((max, h) => Math.max(max, h.col), 0) + 1;
  const { width, height, viewBox } = mapBounds(rows, cols, map.hex_size, map.origin_x, map.origin_y);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const svgWidth = Math.max(width, imgSize?.w ?? 0);
  const svgHeight = Math.max(height, imgSize?.h ?? 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Transform state lives in refs — never in React state — so updates are synchronous.
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const minScale = useRef(0.1);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const fitted = useRef(false);

  function applyTransform() {
    const svg = svgRef.current;
    if (!svg) return;
    const { x, y, scale } = transform.current;
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function fitToContainer(cw: number, ch: number) {
    const fitScale = Math.min(cw / svgWidth, ch / svgHeight);
    minScale.current = fitScale;
    transform.current = {
      scale: fitScale,
      x: (cw - svgWidth * fitScale) / 2,
      y: (ch - svgHeight * fitScale) / 2,
    };
    applyTransform();
  }

  // Fit on mount / when SVG dimensions change / when image loads.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    if (fitted.current && !imgSize) return;
    fitted.current = true;
    fitToContainer(el.clientWidth, el.clientHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgWidth, svgHeight, imgSize]);

  // ResizeObserver for first render when container has no size yet.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || fitted.current) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      fitted.current = true;
      fitToContainer(el.clientWidth, el.clientHeight);
      ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgWidth, svgHeight]);

  // Wheel zoom — non-passive so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const { x, y, scale } = transform.current;
      const next = Math.min(MAX_SCALE, Math.max(minScale.current, scale * factor));
      const ratio = next / scale;
      transform.current = {
        scale: next,
        x: mx - ratio * (mx - x),
        y: my - ratio * (my - y),
      };
      applyTransform();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Drag to pan — native listeners to match wheel handler.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag.current = { startX: e.clientX, startY: e.clientY, ox: transform.current.x, oy: transform.current.y };
    };
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      transform.current.x = drag.current.ox + e.clientX - drag.current.startX;
      transform.current.y = drag.current.oy + e.clientY - drag.current.startY;
      applyTransform();
    };
    const onUp = () => { drag.current = null; };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onUp);
    };
  }, []);

  return (
    <div ref={containerRef} className={styles.container}>
      {map.image && (
        <img
          src={map.image}
          alt=""
          style={{ display: 'none' }}
          onLoad={(e) => {
            const el = e.currentTarget;
            setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
      )}
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        viewBox={imgSize ? undefined : viewBox}
        className={styles.svg}
        style={{ transformOrigin: '0 0' }}
      >
        {map.image && (
          <image
            href={map.image}
            x={0}
            y={0}
            width={imgSize?.w ?? svgWidth}
            height={imgSize?.h ?? svgHeight}
            preserveAspectRatio="none"
          />
        )}
        {hexes.map((hex) => (
          <HexCell
            key={hex.id}
            hex={hex}
            factions={factionsByHex.get(hex.id) ?? []}
            size={map.hex_size}
            originX={map.origin_x}
            originY={map.origin_y}
            selected={hex.id === selectedHexId}
            fogOfWar={fogOfWar}
            onClick={onHexClick}
          />
        ))}

        {/* Faction movement arrows */}
        {(() => {
          const placed = factions.filter((f) => f.current_hex != null);
          const arrows = placed.filter(
            (f) => f.destination != null && f.current_hex !== f.destination,
          );
          const stationary = placed.filter(
            (f) => f.destination == null || f.current_hex === f.destination,
          );
          const uniqueColors = [...new Set(placed.map((f) => f.color ?? '#89b4fa'))];
          const hexById = new Map(hexes.map((h) => [h.id, h]));
          const stroke = Math.max(2, map.hex_size * 0.1);
          const headSize = stroke * 5;

          return (
            <>
              <defs>
                <filter id="faction-arrow-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {uniqueColors.map((color) => {
                  const id = `arrow-head-${color.replace('#', '')}`;
                  return (
                    <marker
                      key={id}
                      id={id}
                      markerUnits="userSpaceOnUse"
                      markerWidth={headSize * 2}
                      markerHeight={headSize * 2}
                      refX={headSize * 1.6}
                      refY={headSize}
                      orient="auto"
                    >
                      <polygon
                        points={`0,0 ${headSize * 2},${headSize} 0,${headSize * 2} ${headSize * 0.6},${headSize}`}
                        fill={color}
                      />
                    </marker>
                  );
                })}
              </defs>

              {arrows.map((f) => {
                const src = hexById.get(f.current_hex!);
                const dst = hexById.get(f.destination!);
                if (!src || !dst) return null;
                const [sx, sy] = hexToPixel(src.row, src.col, map.hex_size, map.origin_x, map.origin_y);
                const [dx, dy] = hexToPixel(dst.row, dst.col, map.hex_size, map.origin_x, map.origin_y);
                const [x1, y1, x2, y2] = shortenLine(sx, sy, dx, dy, map.hex_size * 0.45);
                const color = f.color ?? '#89b4fa';
                const markerId = `arrow-head-${color.replace('#', '')}`;
                return (
                  <g key={f.id} filter="url(#faction-arrow-glow)">
                    {/* glow halo */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={color}
                      strokeWidth={stroke * 3}
                      strokeLinecap="round"
                      opacity={0.25}
                    />
                    {/* main shaft */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={color}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      markerEnd={`url(#${markerId})`}
                      opacity={0.9}
                    />
                    {/* bright centre highlight */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={stroke * 0.35}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {stationary.map((f) => {
                const src = hexById.get(f.current_hex!);
                if (!src) return null;
                const [cx, cy] = hexToPixel(src.row, src.col, map.hex_size, map.origin_x, map.origin_y);
                const color = f.color ?? '#89b4fa';
                const markerId = `arrow-head-${color.replace('#', '')}`;
                const len = map.hex_size * 0.45;
                const x1 = cx;
                const y1 = cy + len * 0.4;
                const x2 = cx;
                const y2 = cy - len;
                return (
                  <g key={f.id} filter="url(#faction-arrow-glow)">
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={color} strokeWidth={stroke * 3} strokeLinecap="round" opacity={0.25} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={color} strokeWidth={stroke} strokeLinecap="round"
                      markerEnd={`url(#${markerId})`} opacity={0.9} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="rgba(255,255,255,0.35)" strokeWidth={stroke * 0.35} strokeLinecap="round" />
                  </g>
                );
              })}
            </>
          );
        })()}
      </svg>
    </div>
  );
}
