"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { HudFrame } from "@/components/lyra/hud-frame";
import { OrbitalChamber } from "@/components/3d/orbital-chamber";
import {
  ForensicEvidencePopup,
  ForensicMenuTrigger,
  type MayForensicPacket,
} from "@/components/lyra/forensic-evidence-popup";
import { SCOUT_HEAL_EVENT } from "@/components/lyra/scout-bot";
import { withBasePath } from "@/lib/static-data";

type SceneNode = {
  id: string;
  label: string;
  entityType: string;
  priority: string;
  position: { x: number; y: number; z: number };
  city: string;
  lat?: number;
  lon?: number;
  anomalyCount: number;
  blackOwned?: boolean;
  ownershipVerification?: string;
  hasMayForensicPacket?: boolean;
  mayForensicElementCount?: number;
  mayForensicCategoryCount?: number;
};

type SceneEvent = {
  id: string;
  entityId: string;
  priority: string;
  title: string;
  label?: string;
  entityName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  categoryId?: string;
  fbiCategory?: string | null;
  artifact?: string | null;
  collectionStatus?: string;
  position?: { x: number; y: number; z: number };
};

type GlobePayload = {
  scene?: {
    nodes?: SceneNode[];
    events?: SceneEvent[];
    populated?: boolean;
    nodeCount?: number;
    eventCount?: number;
    p1EventCount?: number;
    realtime?: string;
  };
  summary?: {
    improvements?: number;
    entityTypes?: number;
    p1Events?: number;
    anomalies?: number;
    postdocImprovements?: number;
    telemetryTicks?: number;
    entities?: number;
    blackOwnedEntities?: number;
    mayForensicPackets?: number;
    mayForensicCategories?: number;
    mayForensicElementsPerEntity?: number;
  };
  postdocCatalog?: { total?: number };
  telemetry?: { active?: boolean; totalTicks?: number; mode?: string };
  mayForensicPackets?: Record<string, MayForensicPacket>;
  evidenceMap?: {
    mayPacket?: {
      period?: string;
      everyEntityHasFullPacket?: boolean;
      categoryCount?: number;
    };
  };
};

function priorityColor(priority: string) {
  if (priority === "P1") return "#fb7185";
  if (priority === "P2") return "#fbbf24";
  return "#94a3b8";
}

function nodeLatLon(node: SceneNode, index: number) {
  if (typeof node.lat === "number" && typeof node.lon === "number") {
    return { lat: node.lat, lon: node.lon };
  }
  // Legacy fallback from CSS scene projection
  const lat = ((node.position.z ?? 0) / 50) * 55;
  const lon = ((node.position.x ?? 0) / 50) * 110 + (index % 7) * 3;
  return { lat, lon };
}

function eventLatLon(event: SceneEvent, index: number) {
  if (typeof event.lat === "number" && typeof event.lon === "number") {
    return { lat: event.lat, lon: event.lon };
  }
  const lat = ((event.position?.z ?? 0) / 50) * 55;
  const lon = ((event.position?.x ?? 0) / 50) * 110 + (index % 9) * 2;
  return { lat, lon };
}

function toVector(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ] as [number, number, number];
}

function greatArc(
  a: [number, number, number],
  b: [number, number, number],
  segments = 24,
): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const len = Math.hypot(x, y, z) || 1;
    const bulge = 1 + Math.sin(Math.PI * t) * 0.22;
    const r = (1.42 * bulge) / len;
    points.push([x * r, y * r, z * r]);
  }
  return points;
}

function EntityMarker({
  node,
  index,
  selected,
  onSelect,
}: {
  node: SceneNode;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const { lat, lon } = nodeLatLon(node, index);
  const position = toVector(lat, lon, 1.55);
  const color = priorityColor(node.priority);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = node.priority === "P1" ? 1 + Math.sin(clock.elapsedTime * 3.2 + index) * 0.1 : 1;
    ref.current.scale.setScalar((selected ? 1.4 : 1) * pulse);
    if (halo.current) {
      const h = 1.2 + Math.sin(clock.elapsedTime * 2.4 + index) * 0.15;
      halo.current.scale.setScalar(h);
      halo.current.rotation.z = clock.elapsedTime * 0.6;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[0.048 + Math.min(node.anomalyCount, 6) * 0.008, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.15 : 0.5}
          roughness={0.35}
          metalness={0.4}
        />
      </mesh>
      {node.priority === "P1" || selected ? (
        <mesh ref={halo}>
          <ringGeometry args={[0.08, 0.11, 32]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.45} />
        </mesh>
      ) : null}
      {selected ? (
        <Html distanceFactor={5.5} position={[0, 0.18, 0]} center>
          <div className="rounded-md border border-primary/30 bg-background/90 px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-lg backdrop-blur-md">
            <span className="font-medium text-primary">{node.label}</span>
            <span className="text-muted-foreground">
              {" "}
              · {node.priority} · {node.city} · {node.anomalyCount} events
            </span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function EventMarker({
  event,
  index,
  selected,
  hot,
  onSelect,
}: {
  event: SceneEvent;
  index: number;
  selected: boolean;
  hot: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<Mesh>(null);
  const { lat, lon } = eventLatLon(event, index);
  const position = toVector(lat, lon, 1.58);
  const color = priorityColor(event.priority);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = hot || event.priority === "P1" ? 1 + Math.sin(clock.elapsedTime * 4 + index) * 0.18 : 1;
    ref.current.scale.setScalar((selected ? 1.5 : hot ? 1.35 : 1) * pulse);
  });

  return (
    <group position={position}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[0.022 + (event.priority === "P1" ? 0.012 : 0.004), 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || hot ? 1.2 : 0.35}
          roughness={0.4}
          metalness={0.35}
        />
      </mesh>
      {selected ? (
        <Html distanceFactor={5} position={[0, 0.12, 0]} center>
          <div className="max-w-[220px] rounded-md border border-primary/30 bg-background/90 px-2 py-1.5 text-[10px] shadow-lg backdrop-blur-md">
            <p className="font-medium text-primary">{event.title}</p>
            {event.artifact ? (
              <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{event.artifact}</p>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function Atmosphere() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as { opacity: number };
    mat.opacity = 0.12 + Math.sin(clock.elapsedTime * 0.8) * 0.03;
  });
  return (
    <mesh ref={ref} scale={1.18}>
      <sphereGeometry args={[1.35, 48, 48]} />
      <meshBasicMaterial color="#5eead4" transparent opacity={0.14} depthWrite={false} />
    </mesh>
  );
}

function OrbitalRings() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z += delta * 0.15;
  });
  return (
    <group ref={group} rotation={[Math.PI / 2.4, 0.2, 0]}>
      <mesh>
        <torusGeometry args={[1.95, 0.008, 8, 96]} />
        <meshBasicMaterial color="#f5e6a8" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[0.4, 0.6, 0.2]}>
        <torusGeometry args={[2.15, 0.005, 8, 96]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function LinkArcs({ events }: { events: SceneEvent[] }) {
  const arcs = useMemo(() => {
    const p1 = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.priority === "P1")
      .slice(0, 8);
    const out: [number, number, number][][] = [];
    for (let i = 0; i < p1.length - 1; i += 1) {
      const a = eventLatLon(p1[i].e, p1[i].i);
      const b = eventLatLon(p1[i + 1].e, p1[i + 1].i);
      out.push(greatArc(toVector(a.lat, a.lon, 1.55), toVector(b.lat, b.lon, 1.55), 20));
    }
    return out;
  }, [events]);

  return (
    <>
      {arcs.map((pts, i) => (
        <group key={`arc-${i}`}>
          {pts.slice(0, -1).map((p, j) => {
            const q = pts[j + 1];
            const mid: [number, number, number] = [
              (p[0] + q[0]) / 2,
              (p[1] + q[1]) / 2,
              (p[2] + q[2]) / 2,
            ];
            return (
              <mesh key={j} position={mid}>
                <sphereGeometry args={[0.008, 6, 6]} />
                <meshBasicMaterial color="#fbbf24" transparent opacity={0.55} />
              </mesh>
            );
          })}
        </group>
      ))}
    </>
  );
}

function GlobeScene({
  nodes,
  events,
  selectedEntityId,
  selectedEventId,
  hotEventId,
  onSelectEntity,
  onSelectEvent,
}: {
  nodes: SceneNode[];
  events: SceneEvent[];
  selectedEntityId: string | null;
  selectedEventId: string | null;
  hotEventId: string | null;
  onSelectEntity: (id: string) => void;
  onSelectEvent: (id: string) => void;
}) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.06;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1.35, 64, 64]} />
        <meshStandardMaterial
          color="#0b1c28"
          roughness={0.55}
          metalness={0.55}
          emissive="#0a3a42"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.365, 48, 48]} />
        <meshBasicMaterial color="#5eead4" wireframe transparent opacity={0.18} />
      </mesh>
      <Atmosphere />
      <OrbitalRings />
      <LinkArcs events={events} />
      {nodes.map((node, index) => (
        <EntityMarker
          key={node.id}
          node={node}
          index={index}
          selected={selectedEntityId === node.id}
          onSelect={() => onSelectEntity(node.id)}
        />
      ))}
      {events.map((event, index) => (
        <EventMarker
          key={event.id}
          event={event}
          index={index}
          selected={selectedEventId === event.id}
          hot={hotEventId === event.id}
          onSelect={() => onSelectEvent(event.id)}
        />
      ))}
      <Stars radius={48} depth={36} count={1600} factor={3.2} saturation={0} fade speed={0.55} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 3, 2]} intensity={1.25} color="#fef3c7" />
      <pointLight position={[-3, -1, -2]} intensity={0.55} color="#5eead4" />
      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={6.2} enableDamping dampingFactor={0.08} />
    </group>
  );
}

class GlobeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "WebGL failed" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Orbital globe error", error, info);
  }
  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function CssFallbackGlobe({
  nodes,
  events,
  selectedEntityId,
  hotEventId,
  blackOwnedOnly,
  onSelectEntity,
  onSelectEvent,
}: {
  nodes: SceneNode[];
  events: SceneEvent[];
  selectedEntityId: string | null;
  hotEventId: string | null;
  blackOwnedOnly: boolean;
  onSelectEntity: (id: string) => void;
  onSelectEvent: (id: string) => void;
}) {
  return (
    <OrbitalChamber
      nodes={nodes}
      events={events}
      selectedEntityId={selectedEntityId}
      hotEventId={hotEventId}
      blackOwnedOnly={blackOwnedOnly}
      onSelectEntity={onSelectEntity}
      onSelectEvent={onSelectEvent}
    />
  );
}

export default function BusinessGlobe({ initialData }: { initialData?: GlobePayload }) {
  const [payload, setPayload] = useState<GlobePayload | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    initialData?.scene?.nodes?.[0]?.id ?? null,
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hotEventIndex, setHotEventIndex] = useState(0);
  const [webglOk, setWebglOk] = useState(false);
  const [preferWebgl, setPreferWebgl] = useState(false);
  const [blackOwnedOnly, setBlackOwnedOnly] = useState(true);
  const [forensicOpen, setForensicOpen] = useState(false);
  const [forensicPacket, setForensicPacket] = useState<MayForensicPacket | null>(null);
  const [forensicFbi, setForensicFbi] = useState<string | null>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ||
        canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
      setWebglOk(Boolean(gl));
    } catch {
      setWebglOk(false);
    }
  }, []);

  useEffect(() => {
    const hasNodes = Boolean(initialData?.scene?.nodes?.length);
    if (hasNodes) {
      setPayload(initialData ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(withBasePath("/static/anomaly.json"), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // Pages may omit Content-Type — parse JSON regardless.
        const data = (await response.json()) as GlobePayload;
        if (!cancelled) {
          setPayload(data);
          const firstOwned = data.scene?.nodes?.find((n) => n.blackOwned)?.id;
          setSelectedEntityId(firstOwned ?? data.scene?.nodes?.[0]?.id ?? null);
        }
      } catch {
        if (!cancelled && !initialData) setError("Could not load fixture globe data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  useEffect(() => {
    function onScoutHeal(event: Event) {
      const detail = (event as CustomEvent).detail as {
        book?: GlobePayload;
        selectedEntityId?: string | null;
      };
      if (!detail?.book?.scene?.nodes?.length) return;
      setPayload(detail.book);
      setError(null);
      if (detail.selectedEntityId) {
        setSelectedEntityId(detail.selectedEntityId);
      } else {
        const nextNodes = detail.book.scene.nodes;
        const owned = nextNodes.find((n) => n.blackOwned)?.id;
        setSelectedEntityId((prev) =>
          prev && nextNodes.some((n) => n.id === prev) ? prev : (owned ?? nextNodes[0]?.id ?? null),
        );
      }
    }
    window.addEventListener(SCOUT_HEAL_EVENT, onScoutHeal);
    return () => window.removeEventListener(SCOUT_HEAL_EVENT, onScoutHeal);
  }, []);

  const nodes = useMemo(() => payload?.scene?.nodes ?? [], [payload]);
  const events = useMemo(() => payload?.scene?.events ?? [], [payload]);
  const filteredNodes = useMemo(
    () => (blackOwnedOnly ? nodes.filter((n) => n.blackOwned) : nodes),
    [nodes, blackOwnedOnly],
  );
  const filteredEvents = useMemo(() => {
    if (!blackOwnedOnly) return events;
    const ids = new Set(filteredNodes.map((n) => n.id));
    return events.filter((e) => ids.has(e.entityId));
  }, [events, blackOwnedOnly, filteredNodes]);
  const p1Events = useMemo(() => filteredEvents.filter((e) => e.priority === "P1"), [filteredEvents]);

  useEffect(() => {
    if (!p1Events.length) {
      setHotEventIndex(0);
      return;
    }
    setHotEventIndex((i) => i % p1Events.length);
    const id = window.setInterval(() => {
      setHotEventIndex((i) => (i + 1) % p1Events.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, [p1Events]);

  useEffect(() => {
    if (blackOwnedOnly && filteredNodes.length) {
      if (!filteredNodes.some((n) => n.id === selectedEntityId)) {
        setSelectedEntityId(filteredNodes[0].id);
      }
    }
  }, [blackOwnedOnly, filteredNodes, selectedEntityId]);

  const hotEventId = p1Events[hotEventIndex]?.id ?? null;
  const selectedEntity = filteredNodes.find((n) => n.id === selectedEntityId) ?? null;
  const selectedEvent =
    filteredEvents.find((e) => e.id === selectedEventId) ?? p1Events[hotEventIndex] ?? null;

  const postdoc = payload?.summary?.postdocImprovements ?? payload?.postdocCatalog?.total ?? 0;
  const blackOwnedCount =
    payload?.summary?.blackOwnedEntities ?? nodes.filter((n) => n.blackOwned).length;
  const mayCategories =
    payload?.summary?.mayForensicCategories ??
    payload?.evidenceMap?.mayPacket?.categoryCount ??
    10;
  const mayElements =
    payload?.summary?.mayForensicElementsPerEntity ??
    selectedEntity?.mayForensicElementCount ??
    0;

  function openForensicForEntity(entityId: string, fbiCategory?: string | null) {
    const packet = payload?.mayForensicPackets?.[entityId] ?? null;
    if (!packet) return;
    setForensicPacket(packet);
    setForensicFbi(fbiCategory ?? null);
    setForensicOpen(true);
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">{error}</div>
    );
  }

  if (!payload) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Loading orbital 3D…
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Globe payload empty — regenerate static anomaly.json
      </div>
    );
  }

  const chamber = (
    <OrbitalChamber
      nodes={nodes}
      events={events}
      selectedEntityId={selectedEntityId}
      hotEventId={hotEventId}
      blackOwnedOnly={blackOwnedOnly}
      onSelectEntity={(id) => {
        setSelectedEntityId(id);
        setSelectedEventId(null);
        openForensicForEntity(id);
      }}
      onSelectEvent={(id) => {
        setSelectedEventId(id);
        const ev = events.find((e) => e.id === id);
        if (ev) {
          setSelectedEntityId(ev.entityId);
          openForensicForEntity(ev.entityId, ev.fbiCategory ?? null);
        }
      }}
    />
  );

  const useWebgl = preferWebgl && webglOk;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.14em] uppercase transition ${
            blackOwnedOnly
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setBlackOwnedOnly(true)}
        >
          Verify Black-owned only
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.14em] uppercase transition ${
            !blackOwnedOnly
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setBlackOwnedOnly(false)}
        >
          All businesses
        </button>
        {webglOk ? (
          <button
            type="button"
            className="rounded-full border border-border/60 px-3 py-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground"
            onClick={() => setPreferWebgl((v) => !v)}
          >
            {preferWebgl ? "3D chamber" : "WebGL globe"}
          </button>
        ) : null}
        <ForensicMenuTrigger
          label="May forensic menu"
          disabled={!selectedEntityId || !payload?.mayForensicPackets?.[selectedEntityId]}
          onClick={() => {
            if (selectedEntityId) openForensicForEntity(selectedEntityId, selectedEvent?.fbiCategory);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <div className="hud-stat">
          <span className="hud-stat-value">{filteredNodes.length}</span>
          <span className="hud-stat-label">Entities</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{filteredEvents.length}</span>
          <span className="hud-stat-label">Anomalies</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{p1Events.length}</span>
          <span className="hud-stat-label">P1 live</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{blackOwnedCount}</span>
          <span className="hud-stat-label">Black-owned</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{mayCategories}</span>
          <span className="hud-stat-label">May FBI cats</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{mayElements || "—"}</span>
          <span className="hud-stat-label">May elements</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{postdoc || 500}</span>
          <span className="hud-stat-label">Post-doc</span>
        </div>
      </div>

      <HudFrame className="globe-stage">
        <div className="relative z-[2] w-full">
          {useWebgl ? (
            <GlobeErrorBoundary fallback={chamber}>
              <div className="h-[min(70vh,560px)] w-full">
                <Canvas
                  camera={{ position: [0, 0.35, 3.7], fov: 42 }}
                  dpr={[1, 1.75]}
                  gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
                  onCreated={({ gl }) => {
                    gl.setClearColor("#030a10");
                  }}
                >
                  <color attach="background" args={["#030a10"]} />
                  <fog attach="fog" args={["#030a10", 6, 16]} />
                  <GlobeScene
                    nodes={filteredNodes}
                    events={filteredEvents}
                    selectedEntityId={selectedEntityId}
                    selectedEventId={selectedEventId}
                    hotEventId={hotEventId}
                    onSelectEntity={(id) => {
                      setSelectedEntityId(id);
                      setSelectedEventId(null);
                      openForensicForEntity(id);
                    }}
                    onSelectEvent={(id) => {
                      setSelectedEventId(id);
                      const ev = filteredEvents.find((e) => e.id === id);
                      if (ev) {
                        setSelectedEntityId(ev.entityId);
                        openForensicForEntity(ev.entityId, ev.fbiCategory ?? null);
                      }
                    }}
                  />
                </Canvas>
              </div>
            </GlobeErrorBoundary>
          ) : (
            chamber
          )}
        </div>
      </HudFrame>

      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
        <span className="hud-beacon" aria-hidden />
        <span className="tracking-[0.14em] text-emerald-300/90 uppercase">3D populated</span>
        <span>
          {filteredNodes.length} entities · {filteredEvents.length} distinct anomalies
          {blackOwnedOnly ? " · Black-owned verify" : ""} · May forensic menus on every company ·
          fixture ownership only
        </span>
      </div>

      {selectedEntity || selectedEvent ? (
        <p className="px-1 text-sm">
          {selectedEvent ? (
            <>
              <span className="font-medium text-primary">{selectedEvent.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {selectedEvent.entityName ?? selectedEntity?.label} · {selectedEvent.priority}
                {selectedEvent.artifact ? ` · ${selectedEvent.artifact}` : ""}
              </span>
            </>
          ) : selectedEntity ? (
            <>
              <span className="font-medium text-primary">{selectedEntity.label}</span>
              <span className="text-muted-foreground">
                {" "}
                · {selectedEntity.entityType} · {selectedEntity.city} · {selectedEntity.priority}
                {selectedEntity.blackOwned ? " · Black-owned (fixture-verified)" : ""} ·{" "}
                {selectedEntity.anomalyCount} anomalies ·{" "}
                {selectedEntity.mayForensicCategoryCount ?? mayCategories} May forensic categories
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      <ForensicEvidencePopup
        open={forensicOpen}
        onOpenChange={setForensicOpen}
        packet={forensicPacket}
        highlightFbiCategory={forensicFbi}
      />
    </div>
  );
}
