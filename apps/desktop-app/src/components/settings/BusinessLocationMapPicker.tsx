import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface MapPoint {
  latitude: number;
  longitude: number;
}

interface MapSize {
  width: number;
  height: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startCenterWorldX: number;
  startCenterWorldY: number;
  moved: boolean;
}

interface BusinessLocationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onSelect: (latitude: number, longitude: number) => void;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 6;
const SELECTED_ZOOM = 15;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const DEFAULT_CENTER: MapPoint = { latitude: 39, longitude: 35 };

export function BusinessLocationMapPicker({ latitude, longitude, onSelect }: BusinessLocationMapPickerProps) {
  const selectedPoint = useMemo<MapPoint | null>(
    () => isMapPoint(latitude, longitude) ? { latitude, longitude: longitude as number } : null,
    [latitude, longitude]
  );
  const [center, setCenter] = useState<MapPoint>(selectedPoint ?? DEFAULT_CENTER);
  const [zoom, setZoom] = useState(selectedPoint ? SELECTED_ZOOM : DEFAULT_ZOOM);
  const [size, setSize] = useState<MapSize>({ width: 640, height: 320 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedPoint) return;
    setCenter(selectedPoint);
    setZoom((current) => current < 13 ? SELECTED_ZOOM : current);
  }, [selectedPoint]);

  const tiles = useMemo(() => buildVisibleTiles(center, zoom, size), [center, zoom, size]);
  const marker = useMemo(
    () => selectedPoint ? projectMarker(selectedPoint, center, zoom, size) : null,
    [selectedPoint, center, zoom, size]
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const centerWorld = projectWorld(center, zoom);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterWorldX: centerWorld.x,
      startCenterWorldY: centerWorld.y,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) drag.moved = true;

    const nextCenter = unprojectWorld({
      x: drag.startCenterWorldX - deltaX,
      y: drag.startCenterWorldY - deltaY
    }, zoom);
    setCenter(nextCenter);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = unprojectWorld({
        x: drag.startCenterWorldX - (size.width / 2) + (event.clientX - rect.left),
        y: drag.startCenterWorldY - (size.height / 2) + (event.clientY - rect.top)
      }, zoom);
      onSelect(roundCoordinate(point.latitude), roundCoordinate(point.longitude));
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const changeZoom = (delta: number) => {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  };

  const focusSelected = () => {
    if (!selectedPoint) return;
    setCenter(selectedPoint);
    setZoom((current) => Math.max(current, SELECTED_ZOOM));
  };

  return (
    <div className="business-location-map-picker">
      <div
        ref={viewportRef}
        className="business-location-map-viewport"
        role="application"
        aria-label="İşletme konumu haritası"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="business-location-map-tiles" aria-hidden="true">
          {tiles.map((tile) => (
            <img
              key={tile.key}
              className="business-location-map-tile"
              src={tile.url}
              alt=""
              draggable={false}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>

        {marker?.visible && (
          <div
            className="business-location-map-marker"
            style={{ left: marker.left, top: marker.top }}
            aria-label="Seçili işletme konumu"
            title="Seçili işletme konumu"
          >
            <span />
          </div>
        )}

        <div className="business-location-map-controls">
          <button type="button" onClick={() => changeZoom(1)} disabled={zoom >= MAX_ZOOM} aria-label="Haritayı yakınlaştır">+</button>
          <button type="button" onClick={() => changeZoom(-1)} disabled={zoom <= MIN_ZOOM} aria-label="Haritayı uzaklaştır">−</button>
          <button type="button" onClick={focusSelected} disabled={!selectedPoint}>Seçili noktaya git</button>
        </div>

        <button
          type="button"
          className="business-location-map-attribution"
          onClick={() => void window.yardimciDesktop?.openExternal("https://www.openstreetmap.org/copyright")}
        >
          © OpenStreetMap katkıda bulunanlar
        </button>
      </div>

      <small>
        Haritada tıklayarak noktayı seçin; sürükleyerek gezinin ve +/− ile yakınlaştırın. Harita karoları internet bağlantısı gerektirir,
        fakat koordinatları çevrimdışıyken de elle girebilirsiniz.
      </small>
    </div>
  );
}

function isMapPoint(latitude: number | null, longitude: number | null): latitude is number {
  return latitude !== null
    && longitude !== null
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function projectWorld(point: MapPoint, zoom: number) {
  const worldSize = TILE_SIZE * (2 ** zoom);
  const latitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, point.latitude));
  const sinLatitude = Math.sin(latitude * Math.PI / 180);
  return {
    x: ((normalizeLongitude(point.longitude) + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize
  };
}

function unprojectWorld(world: { x: number; y: number }, zoom: number): MapPoint {
  const worldSize = TILE_SIZE * (2 ** zoom);
  const normalizedY = Math.min(worldSize, Math.max(0, world.y));
  const longitude = normalizeLongitude((world.x / worldSize) * 360 - 180);
  const mercatorN = Math.PI - (2 * Math.PI * normalizedY / worldSize);
  const latitude = 180 / Math.PI * Math.atan(Math.sinh(mercatorN));
  return { latitude, longitude };
}

function buildVisibleTiles(center: MapPoint, zoom: number, size: MapSize) {
  const centerWorld = projectWorld(center, zoom);
  const leftWorld = centerWorld.x - size.width / 2;
  const topWorld = centerWorld.y - size.height / 2;
  const firstTileX = Math.floor(leftWorld / TILE_SIZE);
  const lastTileX = Math.floor((leftWorld + size.width) / TILE_SIZE);
  const firstTileY = Math.floor(topWorld / TILE_SIZE);
  const lastTileY = Math.floor((topWorld + size.height) / TILE_SIZE);
  const tileCount = 2 ** zoom;
  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) continue;
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}:${tileX}:${tileY}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
        left: tileX * TILE_SIZE - leftWorld,
        top: tileY * TILE_SIZE - topWorld
      });
    }
  }

  return tiles;
}

function projectMarker(point: MapPoint, center: MapPoint, zoom: number, size: MapSize) {
  const worldSize = TILE_SIZE * (2 ** zoom);
  const centerWorld = projectWorld(center, zoom);
  const markerWorld = projectWorld(point, zoom);
  let deltaX = markerWorld.x - centerWorld.x;
  if (deltaX > worldSize / 2) deltaX -= worldSize;
  if (deltaX < -worldSize / 2) deltaX += worldSize;
  const deltaY = markerWorld.y - centerWorld.y;
  const left = size.width / 2 + deltaX;
  const top = size.height / 2 + deltaY;
  return {
    left,
    top,
    visible: left >= -24 && left <= size.width + 24 && top >= -36 && top <= size.height + 36
  };
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
