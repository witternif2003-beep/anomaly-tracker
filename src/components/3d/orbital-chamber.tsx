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
/** Post-doc verified: keep card density readable (~Fibonacci + LOD). */
const MAX_LABELED_ANOMALIES = 12;
const MAX_LABELED_ENTITIES = 8;

function priorityClass(priority: string) {
  if (priority === "P1") return "chamber-orb--p1";
  if (priority === "P2") return "chamber-orb--p2";
  return "chamber-orb--p3";
}

function priorityRank(priority: string) {
  if (priority === "P1") return 0;
  if (priority === "P2") return 1;
  return 2;
}

/**
 * Fibonacci / golden-angle lattice on a sphere.
 * Radius scales with √n so nearest-neighbor spacing stays usable as density rises.
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
    radius,
  };
}

/** Rotate Y then read camera-facing depth (positive z toward viewer at angle 0). */
function depthAfterYaw(x: number, z: number, yaw: number) {
  return x * Math.sin(yaw) + z * Math.cos(yaw);
}

function shortTitle(title: string, max = 42) {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
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

function cardAnchor(index: number): "ne" | "nw" | "se" | "sw" {
  const modes = ["ne", "nw", "se", "sw"] as const;
  return modes[index % 4];
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const stars = useMemo(() => starField(64), []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /** Corrected rotation: JS yaw only (fixed X tilt on rig) — counter-billboard uses same yaw. */
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        setYaw((y) => (y + dt * 0.22) % (Math.PI * 2));
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

  const labeledEntityIds = useMemo(() => {
    const ranked = [...visibleNodes].sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        b.anomalyCount - a.anomalyCount,
    );
    const ids = new Set<string>();
    for (const n of ranked) {
      if (ids.size >= MAX_LABELED_ENTITIES) break;
      ids.add(n.id);
    }
    if (selectedEntityId) ids.add(selectedEntityId);
    return ids;
  }, [visibleNodes, selectedEntityId]);

  const labeledEventIds = useMemo(() => {
    const ranked = [...visibleEvents].sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.title.localeCompare(b.title),
    );
    const ids = new Set<string>();
    for (const e of visibleEvents) {
      if (e.priority === "P1") ids.add(e.id);
    }
    for (const e of ranked) {
      if (ids.size >= MAX_LABELED_ANOMALIES) break;
      ids.add(e.id);
    }
    if (hotEventId) ids.add(hotEventId);
    return ids;
  }, [visibleEvents, hotEventId]);

  const entityOrbs = useMemo(
    () =>
      visibleNodes.map((node, i) => {
        const pt = spherePoint(i, Math.max(visibleNodes.length, 1), 150, 0.15);
        return { node, ...pt, anchor: cardAnchor(i) };
      }),
    [visibleNodes],
  );

  const anomalyOrbs = useMemo(
    () =>
      visibleEvents.map((event, i) => {
        // Phase offset keeps anomaly lattice from stacking on entity lattice.
        const pt = spherePoint(i, Math.max(visibleEvents.length, 1), 268, 1.1);
        return {
          event,
          ...pt,
          anchor: cardAnchor(i + 1),
          scale: event.priority === "P1" ? 1.12 : event.priority === "P2" ? 1.02 : 0.92,
        };
      }),
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
        <span className="chamber-hud-title">3D anomaly chamber · corrected spacing</span>
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

      <div className="chamber-zoom-rig" style={{ transform: `scale3d(${zoom}, ${zoom}, ${zoom})` }}>
        <div
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
            {entityOrbs.map(({ node, x, y, z, anchor }) => {
              const depth = depthAfterYaw(x, z, yaw);
              const facing = depth > -40;
              const showLabel = facing && labeledEntityIds.has(node.id);
              const zIndex = Math.round(200 + depth);
              return (
                <button
                  key={node.id}
                  type="button"
                  className={cn(
                    "chamber-entity",
                    priorityClass(node.priority),
                    selectedEntityId === node.id && "chamber-entity--selected",
                    node.blackOwned && "chamber-entity--owned",
                    !facing && "chamber-orb--occluded",
                  )}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, ${z}px)`,
                    zIndex,
                  }}
                  onClick={() => onSelectEntity(node.id)}
                  title={`${node.label} · ${node.city}${node.blackOwned ? " · Black-owned (fixture)" : ""}`}
                >
                  <span
                    className="chamber-billboard chamber-billboard--js"
                    style={{ transform: `rotateY(${-yaw}rad)` }}
                  >
                    <span className="chamber-entity-dot" />
                    <span className="chamber-entity-ring" aria-hidden />
                    {showLabel ? (
                      <span className={cn("chamber-entity-label", `chamber-card--${anchor}`)}>
                        {node.label}
                        {node.blackOwned ? <em> · BO</em> : null}
                      </span>
                    ) : null}
                    {node.anomalyCount > 0 ? (
                      <span className="chamber-entity-count">{node.anomalyCount}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {anomalyOrbs.map(({ event, x, y, z, scale, anchor }) => {
              const depth = depthAfterYaw(x, z, yaw);
              const facing = depth > -55;
              const showCard =
                facing &&
                (labeledEventIds.has(event.id) ||
                  event.id === hotEventId ||
                  selectedEntityId === event.entityId);
              const zIndex = Math.round(220 + depth);
              return (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    "chamber-anomaly",
                    priorityClass(event.priority),
                    hotEventId === event.id && "chamber-anomaly--hot",
                    !facing && "chamber-orb--occluded",
                  )}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`,
                    zIndex,
                  }}
                  onClick={() => onSelectEvent?.(event.id)}
                  title={`${event.priority} · ${event.title}`}
                >
                  <span
                    className="chamber-billboard chamber-billboard--js"
                    style={{ transform: `rotateY(${-yaw}rad)` }}
                  >
                    <span className="chamber-anomaly-core" />
                    <span className="chamber-anomaly-halo" />
                    <span className="chamber-anomaly-spine" aria-hidden />
                    {showCard ? (
                      <span className={cn("chamber-anomaly-card", `chamber-card--${anchor}`)}>
                        <span className="chamber-anomaly-pri">{event.priority}</span>
                        <span className="chamber-anomaly-title">{shortTitle(event.title)}</span>
                        {event.artifact ? (
                          <span className="chamber-anomaly-meta">{shortTitle(event.artifact, 36)}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="chamber-hud-bottom">
        <span>
          {visibleNodes.length} entities · {visibleEvents.length} anomalies · Fibonacci √n spacing ·
          depth-culled labels · zoom {zoomPct}%
        </span>
        {blackOwnedOnly ? <span className="chamber-owned-pill">Black-owned verify only</span> : null}
      </div>
    </div>
  );
}
