import { useMemo, useRef, useState, useEffect } from 'react';
import type { Hex, Faction, Map } from '../../types';
import { HexCell } from './HexCell';
import { mapBounds } from './hexGeometry';
import styles from './HexMap.module.css';

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
      </svg>
    </div>
  );
}
