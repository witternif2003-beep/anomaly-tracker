"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent,
} from "react";
import { cn } from "@/lib/utils";

export type ChamberNode = {
  id: string;
  label: string;
  entityType: string;
  priority: string;
  city: string;
  anomalyCount: number;
  blackOwned?: boolean;
};

export type ChamberEvent = {
  id: string;
  entityId: string;
  priority: string;
  title: string;
  artifact?: string | null;
  entityName?: string;
  categoryId?: string;
};

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.35;
const ZOOM_STEP = 0.12;
const TILT = (16 * Math.PI) / 180;
const PERSPECTIVE = 1280;
const LABEL_W = 168;
const LABEL_H = 52;
/** Control strip height; labels anchor below this so translate(-50%,-100%) stays clear. */
const HUD_CONTROL_HEIGHT = 78;
const HUD_SAFE_TOP = HUD_CONTROL_HEIGHT + LABEL_H;

function priorityClass(priority: string) {
  if (priority === "P1") return "chamber-orb--p1";
  if (priority === "P2") return "chamber-orb--p2";
  return "chamber-orb--p3";
}

/**
 * Fibonacci / golden-angle lattice.
 * Radius scales with √n for usable nearest-neighbor spacing.
 */
function spherePoint(index: number, total: number, baseRadius: number, phase = 0) {
  const n = Math.max(total, 1);
  const radius = baseRadius * Math.max(1, Math.sqrt(n / 8));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(n - 1, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + phase;
  return {
    x: Math.cos(theta) * r * radius,
    y: y * radius,
    z: Math.sin(theta) * r * radius,
  };
}

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function starField(count: number) {
  const stars: { x: number; y: number; z: number; s: number; o: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) * 12.9898;
    const u = (i + 1) * 78.233;
    const n1 = Math.abs(Math.sin(t) * 43758.5453) % 1;
    const n2 = Math.abs(Math.sin(u) * 24634.6345) % 1;
    const n3 = Math.abs(Math.sin(t + u) * 96433.12) % 1;
    stars.push({
      x: (n1 - 0.5) * 920,
      y: (n2 - 0.5) * 620,
      z: -180 - n3 * 520,
      s: 1 + (n3 % 1) * 2.2,
      o: 0.25 + (n1 % 1) * 0.65,
    });
  }
  return stars;
}

/** Match CSS `rotateX(tilt) rotateY(yaw)` (applied right-to-left). */
function projectPoint(
  x: number,
  y: number,
  z: number,
  yaw: number,
  zoom: number,
  cx: number,
  cy: number,
) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const y1 = y;
  const z1 = -x * sinY + z * cosY;

  const cosX = Math.cos(TILT);
  const sinX = Math.sin(TILT);
  const x2 = x1 * zoom;
  const y2 = (y1 * cosX - z1 * sinX) * zoom;
  const z2 = (y1 * sinX + z1 * cosX) * zoom;

  const denom = Math.max(40, PERSPECTIVE - z2);
  const scale = PERSPECTIVE / denom;
  return {
    sx: cx + x2 * scale,
    sy: cy + y2 * scale,
    depth: z2,
    scale,
  };
}

type OverlayLabel = {
  id: string;
  kind: "entity" | "anomaly";
  priority: string;
  title: string;
  meta?: string;
  x: number;
  y: number;
  depth: number;
  selected?: boolean;
  hot?: boolean;
};

/** Push overlapping screen-space labels apart (post-doc collision pass). */
function resolveCollisions(labels: OverlayLabel[], width: number, height: number) {
  const out = labels.map((l) => ({ ...l }));
  out.sort((a, b) => b.depth - a.depth);
  const minX = LABEL_W * 0.78;
  const minY = LABEL_H * 0.9;
  const top = HUD_SAFE_TOP;
  const bottom = Math.max(top + 80, height - 12);
  const left = 10;
  const right = Math.max(left + 40, width - 10);

  for (let pass = 0; pass < 10; pass += 1) {
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
          const pushX =
            (minX - Math.abs(dx)) *
            0.62 *
            (dx === 0 ? (j % 2 === 0 ? 1 : -1) : Math.sign(dx) || 1);
          const pushY =
            (minY - Math.abs(dy)) * 0.68 * (dy === 0 ? (pass % 2 === 0 ? 1 : -1) : Math.sign(dy) || 1);
          b.x = Math.min(right, Math.max(left, b.x + pushX));
          b.y = Math.min(bottom, Math.max(top, b.y + pushY));
        }
      }
    }
  }

  // Spiral park any remaining overlaps so dense "all businesses" stays readable.
  for (let i = 0; i < out.length; i += 1) {
    for (let j = i + 1; j < out.length; j += 1) {
      const a = out[i];
      const b = out[j];
      if (Math.abs(b.x - a.x) < minX * 0.9 && Math.abs(b.y - a.y) < minY * 0.9) {
        const slot = j;
        const col = slot % 3;
        const row = Math.floor(slot / 3);
        b.x = left + 16 + col * (LABEL_W * 0.92);
        b.y = top + 8 + row * (LABEL_H * 0.95);
        if (b.x > right) b.x = right - (slot % 7) * 12;
        if (b.y > bottom) b.y = bottom - (slot % 5) * 10;
      }
    }
  }

  return out.sort((a, b) => a.depth - b.depth);
}

export function OrbitalChamber({
  nodes,
  events,
  selectedEntityId,
  hotEventId,
  blackOwnedOnly,
  onSelectEntity,
  onSelectEvent,
}: {
  nodes: ChamberNode[];
  events: ChamberEvent[];
  selectedEntityId: string | null;
  hotEventId: string | null;
  blackOwnedOnly?: boolean;
  onSelectEntity: (id: string) => void;
  onSelectEvent?: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [yaw, setYaw] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const stars = useMemo(() => starField(48), []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Slow continuous yaw — labels stay in flat overlay (never perspective-blurred). */
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        setYaw((y) => (y + dt * 0.16) % (Math.PI * 2));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const visibleNodes = useMemo(
    () => (blackOwnedOnly ? nodes.filter((n) => n.blackOwned) : nodes),
    [nodes, blackOwnedOnly],
  );

  const visibleEvents = useMemo(() => {
    if (!blackOwnedOnly) return events;
    const ids = new Set(visibleNodes.map((n) => n.id));
    return events.filter((e) => ids.has(e.entityId));
  }, [events, blackOwnedOnly, visibleNodes]);

  const entityOrbs = useMemo(
    () =>
      visibleNodes.map((node, i) => ({
        node,
        ...spherePoint(i, Math.max(visibleNodes.length, 1), 150, 0.15),
      })),
    [visibleNodes],
  );

  const anomalyOrbs = useMemo(
    () =>
      visibleEvents.map((event, i) => ({
        event,
        ...spherePoint(i, Math.max(visibleEvents.length, 1), 268, 1.1),
        scale: event.priority === "P1" ? 1.12 : event.priority === "P2" ? 1.02 : 0.92,
      })),
    [visibleEvents],
  );

  const cx = size.w / 2;
  const cy = size.h * 0.48;

  const overlayLabels = useMemo(() => {
    const dense = visibleNodes.length + visibleEvents.length > 22;
    const raw: OverlayLabel[] = [];
    for (const { node, x, y, z } of entityOrbs) {
      const p = projectPoint(x, y, z, yaw, zoom, cx, cy);
      raw.push({
        id: node.id,
        kind: "entity",
        priority: node.priority,
        title: `${node.label}${node.blackOwned ? " · BO" : ""}`,
        meta: `${node.city} · ${node.anomalyCount} anomalies`,
        x: p.sx,
        y: Math.max(HUD_SAFE_TOP, p.sy - 18),
        depth: p.depth,
        selected: selectedEntityId === node.id,
      });
    }
    for (const { event, x, y, z } of anomalyOrbs) {
      const isHot = hotEventId === event.id;
      const isSelected = selectedEntityId === event.entityId;
      // Dense "all businesses" mode: keep entity labels + P1 / hot / selected anomalies only.
      // Full anomaly list remains readable in the roster below.
      if (dense && event.priority !== "P1" && !isHot && !isSelected) continue;
      const p = projectPoint(x, y, z, yaw, zoom, cx, cy);
      raw.push({
        id: event.id,
        kind: "anomaly",
        priority: event.priority,
        title: event.title,
        meta: event.artifact ?? event.entityName ?? undefined,
        x: p.sx,
        y: Math.max(HUD_SAFE_TOP, p.sy - 22),
        depth: p.depth,
        hot: isHot,
        selected: isSelected,
      });
    }
    return resolveCollisions(raw, size.w, size.h);
  }, [
    entityOrbs,
    anomalyOrbs,
    visibleNodes.length,
    visibleEvents.length,
    yaw,
    zoom,
    cx,
    cy,
    size.w,
    size.h,
    selectedEntityId,
    hotEventId,
  ]);

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      bumpZoom(dir * (e.ctrlKey || e.metaKey ? 1.6 : 1));
    },
    [bumpZoom],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const native = (ev: Event) => {
      (ev as globalThis.WheelEvent).preventDefault();
    };
    el.addEventListener("wheel", native, { passive: false });
    return () => el.removeEventListener("wheel", native);
  }, []);

  const zoomPct = Math.round(zoom * 100);
  const bgParallax = 0.35 + zoom * 0.35;

  return (
    <div
      ref={viewportRef}
      className="chamber-viewport"
      onWheel={onWheel}
      style={
        {
          "--chamber-zoom": String(zoom),
          "--chamber-bg-scale": String(bgParallax),
        } as CSSProperties
      }
    >
      <div className="chamber-space" aria-hidden>
        <div className="chamber-space-nebula chamber-space-nebula--a" />
        <div className="chamber-space-nebula chamber-space-nebula--b" />
        <div className="chamber-space-grid" />
        <div className="chamber-space-floor" />
        <div className="chamber-space-stars">
          {stars.map((star, i) => (
            <span
              key={`star-${i}`}
              className="chamber-star"
              style={{
                transform: `translate3d(${star.x}px, ${star.y}px, ${star.z}px)`,
                width: star.s,
                height: star.s,
                opacity: star.o,
              }}
            />
          ))}
        </div>
        <div className="chamber-space-vignette" />
      </div>

      <div className="chamber-hud-top">
        <span className="chamber-hud-title">3D anomaly chamber · CRISP · SOTA</span>
        <div className="chamber-hud-controls" role="toolbar" aria-label="Chamber view controls">
          <button
            type="button"
            className="chamber-pause"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              bumpZoom(-ZOOM_STEP);
            }}
            aria-label="Zoom out"
          >
            − Zoom
          </button>
          <button
            type="button"
            className="chamber-pause"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoom(1);
            }}
            aria-label="Reset zoom"
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            className="chamber-pause"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              bumpZoom(ZOOM_STEP);
            }}
            aria-label="Zoom in"
          >
            + Zoom
          </button>
          <button
            type="button"
            className="chamber-pause"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPaused((p) => !p);
            }}
            aria-pressed={paused}
            aria-label={paused ? "Resume rotate" : "Pause rotate"}
          >
            {paused ? "Resume rotate" : "Pause rotate"}
          </button>
        </div>
      </div>

      {/* 3D scene: glass + orbs only — no text under perspective (prevents raster blur). */}
      <div className="chamber-zoom-rig">
        <div
          ref={stageRef}
          className="chamber-stage chamber-stage--js"
          style={{ transform: `rotateX(16deg) rotateY(${yaw}rad)` }}
        >
          <div className="chamber-box" aria-hidden>
            <span className="chamber-face chamber-face--front" />
            <span className="chamber-face chamber-face--back" />
            <span className="chamber-face chamber-face--left" />
            <span className="chamber-face chamber-face--right" />
            <span className="chamber-face chamber-face--top" />
            <span className="chamber-face chamber-face--bottom" />
            <span className="chamber-edge chamber-edge--x" />
            <span className="chamber-edge chamber-edge--y" />
            <span className="chamber-edge chamber-edge--z" />
          </div>
          <div className="chamber-core" aria-hidden />
          <div className="chamber-ring chamber-ring--a" aria-hidden />
          <div className="chamber-ring chamber-ring--b" aria-hidden />
          <div className="chamber-ring chamber-ring--c" aria-hidden />
          <div className="chamber-ring chamber-ring--d" aria-hidden />

          <div className="chamber-world">
            {entityOrbs.map(({ node, x, y, z }) => (
              <button
                key={node.id}
                type="button"
                className={cn(
                  "chamber-entity",
                  priorityClass(node.priority),
                  selectedEntityId === node.id && "chamber-entity--selected",
                )}
                style={{ transform: `translate3d(${x * zoom}px, ${y * zoom}px, ${z * zoom}px)` }}
                onClick={() => onSelectEntity(node.id)}
                aria-label={node.label}
              >
                <span className="chamber-orb-mark">
                  <span className="chamber-entity-dot" />
                  <span className="chamber-entity-ring" aria-hidden />
                  {node.anomalyCount > 0 ? (
                    <span className="chamber-entity-count">{node.anomalyCount}</span>
                  ) : null}
                </span>
              </button>
            ))}
            {anomalyOrbs.map(({ event, x, y, z, scale }) => (
              <button
                key={event.id}
                type="button"
                className={cn(
                  "chamber-anomaly",
                  priorityClass(event.priority),
                  hotEventId === event.id && "chamber-anomaly--hot",
                )}
                style={{ transform: `translate3d(${x * zoom}px, ${y * zoom}px, ${z * zoom}px) scale(${scale})` }}
                onClick={() => onSelectEvent?.(event.id)}
                aria-label={event.title}
              >
                <span className="chamber-orb-mark">
                  <span className="chamber-anomaly-core" />
                  <span className="chamber-anomaly-halo" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Flat screen-space labels: translate only, no rotate/perspective, no backdrop-filter. */}
      <div className="chamber-label-layer" aria-live="polite">
        {overlayLabels.map((label) => (
          <button
            key={`label-${label.kind}-${label.id}`}
            type="button"
            className={cn(
              "chamber-flat-label",
              priorityClass(label.priority),
              label.kind === "entity" && "chamber-flat-label--entity",
              label.kind === "anomaly" && "chamber-flat-label--anomaly",
              label.selected && "chamber-flat-label--selected",
              label.hot && "chamber-flat-label--hot",
            )}
            style={{
              transform: `translate3d(${label.x}px, ${label.y}px, 0) translate(-50%, -100%)`,
              zIndex: Math.round(400 + label.depth),
            }}
            onClick={() => {
              if (label.kind === "entity") onSelectEntity(label.id);
              else onSelectEvent?.(label.id);
            }}
            title={label.title}
          >
            <span className="chamber-flat-pri">{label.priority}</span>
            <span className="chamber-flat-title">{label.title}</span>
            {label.meta ? <span className="chamber-flat-meta">{label.meta}</span> : null}
          </button>
        ))}
      </div>

      <div className="chamber-roster" aria-label="Complete readable chamber roster">
        <div className="chamber-roster-head">
          All entries · {visibleNodes.length} entities · {visibleEvents.length} anomalies · always
          CRISP
          {visibleNodes.length + visibleEvents.length > 22
            ? " · overlay shows entities + P1/hot (roster has every label)"
            : ""}
          <span className="chamber-roster-sota"> · SOTA flat labels</span>
        </div>
        <ul className="chamber-roster-list">
          {visibleNodes.map((node) => (
            <li key={`roster-n-${node.id}`}>
              <button
                type="button"
                className={cn(
                  "chamber-roster-item",
                  priorityClass(node.priority),
                  selectedEntityId === node.id && "chamber-roster-item--active",
                )}
                onClick={() => onSelectEntity(node.id)}
              >
                <span className="chamber-roster-pri">{node.priority}</span>
                <span className="chamber-roster-text">
                  {node.label}
                  {node.blackOwned ? " · BO" : ""} · {node.city}
                </span>
              </button>
            </li>
          ))}
          {visibleEvents.map((event) => (
            <li key={`roster-e-${event.id}`}>
              <button
                type="button"
                className={cn(
                  "chamber-roster-item",
                  priorityClass(event.priority),
                  hotEventId === event.id && "chamber-roster-item--active",
                )}
                onClick={() => onSelectEvent?.(event.id)}
              >
                <span className="chamber-roster-pri">{event.priority}</span>
                <span className="chamber-roster-text">
                  {event.title}
                  {event.artifact ? ` · ${event.artifact}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="chamber-hud-bottom">
        <span>
          Screen-space labels · no 3D text blur · Fibonacci orbs · zoom {zoomPct}%
        </span>
        {blackOwnedOnly ? <span className="chamber-owned-pill">Black-owned verify only</span> : null}
      </div>
    </div>
  );
}
