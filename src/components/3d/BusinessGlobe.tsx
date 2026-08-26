"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html, Line } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { Color } from "three";
import { HudFrame } from "@/components/lyra/hud-frame";
import { withBasePath } from "@/lib/static-data";

type SceneNode = {
  id: string;
  label: string;
  entityType: string;
  priority: string;
  position: { x: number; y: number; z: number };
  city: string;
  anomalyCount: number;
};

type GlobePayload = {
  scene?: { nodes?: SceneNode[] };
  summary?: { improvements?: number; entityTypes?: number; p1Events?: number };
};

function priorityColor(priority: string) {
  if (priority === "P1") return "#fb7185";
  if (priority === "P2") return "#fbbf24";
  return "#94a3b8";
}

function latLonFromFixture(node: SceneNode, index: number) {
  const lat = ((node.position.z ?? 0) / 50) * 55;
  const lon = ((node.position.x ?? 0) / 50) * 110 + (index % 7) * 3;
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
  segments = 28,
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
  const { lat, lon } = latLonFromFixture(node, index);
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
      <mesh ref={ref} onClick={onSelect}>
        <sphereGeometry args={[0.042 + Math.min(node.anomalyCount, 4) * 0.01, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.1 : 0.45}
          roughness={0.35}
          metalness={0.4}
        />
      </mesh>
      {node.priority === "P1" || selected ? (
        <mesh ref={halo}>
          <ringGeometry args={[0.07, 0.095, 32]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.85 : 0.4} />
        </mesh>
      ) : null}
      {selected ? (
        <Html distanceFactor={5.5} position={[0, 0.16, 0]} center>
          <div className="rounded-md border border-primary/30 bg-background/90 px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-lg backdrop-blur-md">
            <span className="font-medium text-primary">{node.label}</span>
            <span className="text-muted-foreground">
              {" "}
              · {node.priority} · {node.city}
            </span>
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

function LinkArcs({ nodes }: { nodes: SceneNode[] }) {
  const arcs = useMemo(() => {
    const p1 = nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.priority === "P1")
      .slice(0, 6);
    const out: [number, number, number][][] = [];
    for (let i = 0; i < p1.length - 1; i += 1) {
      const a = latLonFromFixture(p1[i].n, p1[i].i);
      const b = latLonFromFixture(p1[i + 1].n, p1[i + 1].i);
      out.push(greatArc(toVector(a.lat, a.lon, 1.55), toVector(b.lat, b.lon, 1.55)));
    }
    return out;
  }, [nodes]);

  return (
    <>
      {arcs.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={new Color("#fbbf24")}
          lineWidth={1.2}
          transparent
          opacity={0.55}
        />
      ))}
    </>
  );
}

function GlobeScene({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.07;
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
      <LinkArcs nodes={nodes} />
      {nodes.map((node, index) => (
        <EntityMarker
          key={node.id}
          node={node}
          index={index}
          selected={selectedId === node.id}
          onSelect={() => onSelect(node.id)}
        />
      ))}
      <Stars radius={48} depth={36} count={1800} factor={3.2} saturation={0} fade speed={0.55} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 3, 2]} intensity={1.25} color="#fef3c7" />
      <pointLight position={[-3, -1, -2]} intensity={0.55} color="#5eead4" />
      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={6.2} autoRotate={false} />
    </group>
  );
}

export default function BusinessGlobe({ initialData }: { initialData?: GlobePayload }) {
  const [payload, setPayload] = useState<GlobePayload | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialData?.scene?.nodes?.[0]?.id ?? null,
  );

  useEffect(() => {
    if (initialData?.scene?.nodes?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(withBasePath("/static/anomaly.json"), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get("content-type") ?? "";
        if (!type.includes("json")) throw new Error("not-json");
        const data = (await response.json()) as GlobePayload;
        if (!cancelled) {
          setPayload(data);
          setSelectedId(data.scene?.nodes?.[0]?.id ?? null);
        }
      } catch {
        if (!cancelled && !initialData) setError("Could not load fixture globe data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const nodes = useMemo(() => payload?.scene?.nodes ?? [], [payload]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Loading orbital 3D…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="hud-stat">
          <span className="hud-stat-value">{payload.summary?.entityTypes ?? 0}</span>
          <span className="hud-stat-label">Entity types</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">{payload.summary?.p1Events ?? 0}</span>
          <span className="hud-stat-label">P1 events</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-value">
            {(payload.summary?.improvements ?? 0).toLocaleString()}
          </span>
          <span className="hud-stat-label">Improvements</span>
        </div>
      </div>

      <HudFrame label="Orbital globe · drag to inspect" className="globe-stage">
        <div className="relative z-[2] h-[min(70vh,560px)] w-full">
          <Canvas camera={{ position: [0, 0.35, 3.7], fov: 42 }} dpr={[1, 1.75]}>
            <color attach="background" args={["#030a10"]} />
            <fog attach="fog" args={["#030a10", 6, 16]} />
            <GlobeScene nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
          </Canvas>
        </div>
      </HudFrame>

      {selected ? (
        <p className="px-1 text-sm">
          <span className="font-medium text-primary">{selected.label}</span>
          <span className="text-muted-foreground">
            {" "}
            · {selected.entityType} · {selected.city} · {selected.priority} ·{" "}
            {selected.anomalyCount} anomalies
          </span>
        </p>
      ) : null}
    </div>
  );
}
