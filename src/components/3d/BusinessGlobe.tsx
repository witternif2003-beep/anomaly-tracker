"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import type { Group, Mesh } from "three";
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
  if (priority === "P1") return "#e11d48";
  if (priority === "P2") return "#d97706";
  return "#64748b";
}

function latLonFromFixture(node: SceneNode, index: number) {
  // Map fixture CSS scene coords into a globe-ish distribution.
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
  const { lat, lon } = latLonFromFixture(node, index);
  const position = toVector(lat, lon, 1.55);
  const color = priorityColor(node.priority);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = node.priority === "P1" ? 1 + Math.sin(clock.elapsedTime * 3 + index) * 0.08 : 1;
    ref.current.scale.setScalar((selected ? 1.35 : 1) * pulse);
  });

  return (
    <mesh ref={ref} position={position} onClick={onSelect}>
      <sphereGeometry args={[0.045 + Math.min(node.anomalyCount, 4) * 0.01, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.9 : 0.35} />
      {selected ? (
        <Html distanceFactor={6} position={[0, 0.12, 0]} center>
          <div className="rounded bg-background/90 px-2 py-1 text-[10px] whitespace-nowrap shadow">
            {node.label} · {node.priority} · {node.city}
          </div>
        </Html>
      ) : null}
    </mesh>
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
    if (group.current) group.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1.35, 48, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} metalness={0.2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.37, 32, 32]} />
        <meshBasicMaterial color="#334155" wireframe transparent opacity={0.25} />
      </mesh>
      {nodes.map((node, index) => (
        <EntityMarker
          key={node.id}
          node={node}
          index={index}
          selected={selectedId === node.id}
          onSelect={() => onSelect(node.id)}
        />
      ))}
      <Stars radius={40} depth={30} count={1200} factor={3} saturation={0} fade speed={0.4} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 3, 2]} intensity={1.1} />
      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={6} />
    </group>
  );
}

export default function BusinessGlobe() {
  const [payload, setPayload] = useState<GlobePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(withBasePath("/static/anomaly.json"));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as GlobePayload;
        if (!cancelled) {
          setPayload(data);
          setSelectedId(data.scene?.nodes?.[0]?.id ?? null);
        }
      } catch {
        if (!cancelled) setError("Could not load fixture globe data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nodes = useMemo(() => payload?.scene?.nodes ?? [], [payload]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-border/60 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-border/60 text-sm text-muted-foreground">
        Loading 3D…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{payload.summary?.entityTypes ?? 0} entity types</span>
        <span>·</span>
        <span>{payload.summary?.p1Events ?? 0} P1 events</span>
        <span>·</span>
        <span>{(payload.summary?.improvements ?? 0).toLocaleString()} improvements</span>
      </div>
      <div className="h-[min(70vh,560px)] overflow-hidden rounded-xl border border-border/60 bg-[#020617]">
        <Canvas camera={{ position: [0, 0, 3.6], fov: 45 }}>
          <GlobeScene nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
        </Canvas>
      </div>
      {selected ? (
        <p className="text-sm">
          <span className="font-medium">{selected.label}</span>
          <span className="text-muted-foreground">
            {" "}
            · {selected.entityType} · {selected.city} · {selected.priority} · {selected.anomalyCount}{" "}
            anomalies
          </span>
        </p>
      ) : null}
    </div>
  );
}
