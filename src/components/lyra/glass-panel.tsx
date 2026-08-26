"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({
  children,
  className,
  hover = true,
  tilt = false,
  intensity = 10,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  /** Pointer-driven 3D tilt (glass HUD panels). */
  tilt?: boolean;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!tilt || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rotY = (x - 0.5) * intensity;
    const rotX = (0.5 - y) * intensity;
    setStyle({
      transform: `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(0)`,
      ["--glass-spot-x" as string]: `${x * 100}%`,
      ["--glass-spot-y" as string]: `${y * 100}%`,
    });
  }

  function onPointerLeave() {
    if (!tilt) return;
    setStyle({
      transform: "perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)",
      ["--glass-spot-x" as string]: "50%",
      ["--glass-spot-y" as string]: "40%",
    });
  }

  return (
    <div
      ref={ref}
      className={cn(
        "glass-panel",
        hover && "glass-panel--hover",
        tilt && "glass-panel--tilt",
        className,
      )}
      style={tilt ? style : undefined}
      onPointerMove={tilt ? onPointerMove : undefined}
      onPointerLeave={tilt ? onPointerLeave : undefined}
    >
      {children}
    </div>
  );
}
