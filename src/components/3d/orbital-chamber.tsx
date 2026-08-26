"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
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

function priorityClass(priority: string) {
  if (priority === "P1") return "chamber-orb--p1";
  if (priority === "P2") return "chamber-orb--p2";
  return "chamber-orb--p3";
}

/** Distribute items on a sphere so each anomaly is distinct (Fibonacci lattice). */
function spherePoint(index: number, total: number, radius: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(total - 1, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index;
  return {
    x: Math.cos(theta) * r * radius,
    y: y * radius,
    z: Math.sin(theta) * r * radius,
  };
}

function shortTitle(title: string, max = 36) {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
}

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

/** Deterministic star positions for the 3D deep-field background. */
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const stars = useMemo(() => starField(64), []);

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
        ...spherePoint(i, Math.max(visibleNodes.length, 1), 128),
      })),
    [visibleNodes],
  );

  const anomalyOrbs = useMemo(
    () =>
      visibleEvents.map((event, i) => ({
        event,
        ...spherePoint(i, Math.max(visibleEvents.length, 1), 236),
        scale: event.priority === "P1" ? 1.22 : event.priority === "P2" ? 1.06 : 0.9,
      })),
    [visibleEvents],
  );

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
      const we = ev as globalThis.WheelEvent;
      we.preventDefault();
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
      style={{ "--chamber-zoom": String(zoom), "--chamber-bg-scale": String(bgParallax) } as CSSProperties}
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
        <span>Post-doc live · 3D anomaly chamber · scroll to zoom</span>
        <div className="chamber-hud-controls">
          <button type="button" className="chamber-pause" onClick={() => bumpZoom(-ZOOM_STEP)} aria-label="Zoom out">
            − Zoom
          </button>
          <button type="button" className="chamber-pause" onClick={() => setZoom(1)} aria-label="Reset zoom">
            {zoomPct}%
          </button>
          <button type="button" className="chamber-pause" onClick={() => bumpZoom(ZOOM_STEP)} aria-label="Zoom in">
            + Zoom
          </button>
          <button type="button" className="chamber-pause" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume rotate" : "Pause rotate"}
          </button>
        </div>
      </div>

      <div
        className="chamber-zoom-rig"
        style={{ transform: `scale3d(${zoom}, ${zoom}, ${zoom})` }}
      >
        <div className={cn("chamber-stage", paused && "chamber-stage--paused")}>
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
                  node.blackOwned && "chamber-entity--owned",
                )}
                style={{
                  transform: `translate3d(${x}px, ${y}px, ${z}px)`,
                }}
                onClick={() => onSelectEntity(node.id)}
                title={`${node.label} · ${node.city}${node.blackOwned ? " · Black-owned (fixture)" : ""}`}
              >
                <span className="chamber-billboard">
                  <span className="chamber-entity-dot" />
                  <span className="chamber-entity-ring" aria-hidden />
                  <span className="chamber-entity-label">
                    {node.label}
                    {node.blackOwned ? <em> · BO</em> : null}
                  </span>
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
                style={{
                  transform: `translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`,
                }}
                onClick={() => onSelectEvent?.(event.id)}
                title={`${event.priority} · ${event.title}`}
              >
                <span className="chamber-billboard">
                  <span className="chamber-anomaly-core" />
                  <span className="chamber-anomaly-halo" />
                  <span className="chamber-anomaly-spine" aria-hidden />
                  <span className="chamber-anomaly-card">
                    <span className="chamber-anomaly-pri">{event.priority}</span>
                    <span className="chamber-anomaly-title">{shortTitle(event.title)}</span>
                    {event.artifact ? (
                      <span className="chamber-anomaly-meta">{event.artifact.slice(0, 28)}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chamber-hud-bottom">
        <span>
          {visibleNodes.length} entities · {visibleEvents.length} distinct anomalies · glass box ·
          Fibonacci lattice · zoom {zoomPct}%
        </span>
        {blackOwnedOnly ? <span className="chamber-owned-pill">Black-owned verify only</span> : null}
      </div>
    </div>
  );
}
