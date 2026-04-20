import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMap, getMaps } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import { hexToPixel, flatTopPoints } from '../../components/HexMap/hexGeometry';
import type { Map } from '../../types';
import styles from './CreateMap.module.css';

const SQRT3 = Math.sqrt(3);
const EDITOR_SIZE = 600;
const MAX_ZOOM = 16;

function previewHexes(imgW: number, imgH: number, hexSize: number, originX: number, originY: number) {
  const cols = Math.max(1, Math.floor(imgW / (hexSize * 1.5)));
  const rows = Math.max(1, Math.floor(imgH / (hexSize * SQRT3)));
  const cells: { points: string; row: number; col: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [cx, cy] = hexToPixel(r, c, hexSize, originX, originY);
      cells.push({ points: flatTopPoints(cx, cy, hexSize - 1), row: r, col: c });
    }
  }
  return cells;
}

export function CreateMap() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);

  const [name, setName] = useState('');
  const [hexSize, setHexSize] = useState(40);
  const [imageSource, setImageSource] = useState<'upload' | 'existing'>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedMap, setSelectedMap] = useState<Map | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  // Editor pan/zoom state (in SVG pixel space)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const editorRef = useRef<SVGSVGElement>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const { data: existingMaps = [] } = useQuery({ queryKey: ['maps'], queryFn: getMaps });

  const mutation = useMutation({
    mutationFn: createMap,
    onSuccess: (map) => {
      queryClient.invalidateQueries({ queryKey: ['maps'] });
      setSelectedMapId(map.id);
      navigate(`/map/${map.id}/gm`);
    },
  });

  const initEditor = (naturalW: number, naturalH: number) => {
    const fitScale = Math.min(EDITOR_SIZE / naturalW, EDITOR_SIZE / naturalH);
    setZoom(fitScale);
    setPan({
      x: (EDITOR_SIZE - naturalW * fitScale) / 2,
      y: (EDITOR_SIZE - naturalH * fitScale) / 2,
    });
  };

  const loadPreview = (url: string, onLoaded?: (w: number, h: number) => void) => {
    setPreviewUrl(url);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      setImgNatural({ w, h });
      setOrigin({ x: hexSize, y: h - hexSize });
      initEditor(w, h);
      onLoaded?.(w, h);
    };
    img.src = url;
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (!file) { setPreviewUrl(null); setImgNatural(null); return; }
    loadPreview(URL.createObjectURL(file));
  };

  const onSelectExisting = (map: Map) => {
    setSelectedMap(map);
    if (map.image) loadPreview(map.image);
  };

  // Zoom toward cursor
  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(0.05, prev * factor));
      const ratio = next / prev;
      setPan(p => ({ x: mx - ratio * (mx - p.x), y: my - ratio * (my - p.y) }));
      return next;
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, moved: false };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.current.moved = true;
    setPan({ x: drag.current.ox + dx, y: drag.current.oy + dy });
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    if (!drag.current.moved && imgNatural) {
      // Convert SVG client coords → natural image coords
      const rect = e.currentTarget.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      setOrigin({
        x: Math.round((svgX - pan.x) / zoom),
        y: Math.round((svgY - pan.y) / zoom),
      });
    }
    drag.current = null;
  }, [imgNatural, pan, zoom]);

  const hexCells = imgNatural
    ? previewHexes(imgNatural.w, imgNatural.h, hexSize, origin.x, origin.y)
    : [];

  const onSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (imageSource === 'upload' && !imageFile) return;
    if (imageSource === 'existing' && !selectedMap?.image) return;
    const imagePath = selectedMap?.image?.replace(/^\/media\//, '');
    mutation.mutate({
      name,
      hex_size: hexSize,
      origin_x: origin.x,
      origin_y: origin.y,
      ...(imageSource === 'upload' ? { image: imageFile! } : { image_path: imagePath }),
    });
  };

  const hasImage = imageSource === 'upload' ? !!imageFile : !!selectedMap;
  const hexCount = imgNatural
    ? Math.max(1, Math.floor(imgNatural.w / (hexSize * 1.5))) *
      Math.max(1, Math.floor(imgNatural.h / (hexSize * SQRT3)))
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <h1>Create Map</h1>
        <form onSubmit={onSubmit} className={styles.form}>

          <label className={styles.label}>
            Name
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <div className={styles.sourceToggle}>
            <button type="button"
              className={imageSource === 'upload' ? styles.toggleActive : styles.toggleInactive}
              onClick={() => { setImageSource('upload'); setPreviewUrl(null); setImgNatural(null); setSelectedMap(null); }}>
              Upload
            </button>
            <button type="button"
              className={imageSource === 'existing' ? styles.toggleActive : styles.toggleInactive}
              onClick={() => { setImageSource('existing'); setPreviewUrl(null); setImgNatural(null); setImageFile(null); }}>
              Use Existing
            </button>
          </div>

          {imageSource === 'upload' && (
            <label className={styles.label}>
              Map Image
              <div className={styles.dropzone} onClick={() => fileRef.current?.click()}>
                {previewUrl
                  ? <img src={previewUrl} className={styles.thumbPreview} alt="" />
                  : <span className={styles.dropHint}>Click to upload</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
            </label>
          )}

          {imageSource === 'existing' && (
            <div className={styles.label}>
              Select Existing Map Image
              <div className={styles.mapGrid}>
                {existingMaps.filter(m => m.image).map(m => (
                  <div key={m.id}
                    className={selectedMap?.id === m.id ? styles.mapThumbSelected : styles.mapThumb}
                    onClick={() => onSelectExisting(m)}>
                    <img src={m.image!} alt={m.name} />
                    <span>{m.name}</span>
                  </div>
                ))}
                {existingMaps.filter(m => m.image).length === 0 && (
                  <p className={styles.hint}>No maps with images found.</p>
                )}
              </div>
            </div>
          )}

          <label className={styles.label}>
            Hex Size (px)
            <input className={styles.input} type="number" min={10} max={200} value={hexSize}
              onChange={(e) => setHexSize(Number(e.target.value))} required />
          </label>

          {previewUrl && imgNatural && (
            <div className={styles.editorWrap}>
              <p className={styles.hint}>Scroll to zoom · drag to pan · click to set origin (red dot = bottom-left hex)</p>
              <svg
                ref={editorRef}
                width={EDITOR_SIZE}
                height={EDITOR_SIZE}
                className={styles.editor}
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => { drag.current = null; }}
              >
                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                  <image href={previewUrl} x={0} y={0} width={imgNatural.w} height={imgNatural.h} preserveAspectRatio="none" />
                  {hexCells.map(({ points, row, col }) => (
                    <polygon
                      key={`${row}-${col}`}
                      points={points}
                      fill="none"
                      stroke="#89b4fa"
                      strokeWidth={1 / zoom}
                      opacity={0.6}
                    />
                  ))}
                  <circle
                    cx={origin.x} cy={origin.y}
                    r={6 / zoom}
                    fill="#f38ba8" stroke="#fff" strokeWidth={1.5 / zoom}
                  />
                </g>
              </svg>
              <p className={styles.hint}>
                Origin: ({origin.x}, {origin.y}) — {hexCount} hexes
              </p>
            </div>
          )}

          {mutation.error && <p className={styles.error}>{String(mutation.error)}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => navigate('/')}>Cancel</button>
            <button type="submit" className={styles.save} disabled={mutation.isPending || !hasImage}>
              {mutation.isPending ? 'Creating…' : 'Create Map'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
