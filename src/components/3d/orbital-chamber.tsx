"use client";

import { useMemo, useState } from "react";
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

function shortTitle(title: string, max = 34) {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
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
        ...spherePoint(i, Math.max(visibleNodes.length, 1), 132),
      })),
    [visibleNodes],
  );

  const anomalyOrbs = useMemo(
    () =>
      visibleEvents.map((event, i) => ({
        event,
        ...spherePoint(i, Math.max(visibleEvents.length, 1), 228),
        scale: event.priority === "P1" ? 1.2 : event.priority === "P2" ? 1.05 : 0.92,
      })),
    [visibleEvents],
  );

  return (
    <div className="chamber-viewport">
      <div className="chamber-hud-top">
        <span>3D anomaly chamber · drag-free rotate</span>
        <button type="button" className="chamber-pause" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume rotate" : "Pause rotate"}
        </button>
      </div>

      <div className={cn("chamber-stage", paused && "chamber-stage--paused")}>
        <div className="chamber-box" aria-hidden>
          <span className="chamber-face chamber-face--front" />
          <span className="chamber-face chamber-face--back" />
          <span className="chamber-face chamber-face--left" />
          <span className="chamber-face chamber-face--right" />
          <span className="chamber-face chamber-face--top" />
          <span className="chamber-face chamber-face--bottom" />
        </div>

        <div className="chamber-core" aria-hidden />
        <div className="chamber-ring chamber-ring--a" aria-hidden />
        <div className="chamber-ring chamber-ring--b" aria-hidden />
        <div className="chamber-ring chamber-ring--c" aria-hidden />

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
                    <span className="chamber-anomaly-meta">{event.artifact.slice(0, 26)}</span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="chamber-hud-bottom">
        <span>
          {visibleNodes.length} entities · {visibleEvents.length} distinct anomalies · rotating 3D box
        </span>
        {blackOwnedOnly ? <span className="chamber-owned-pill">Black-owned verify only</span> : null}
      </div>
    </div>
  );
}
