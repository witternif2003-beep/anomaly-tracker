"use client";

/** CSS/DOM orbs that orbit in 3D space behind the glass console. */
export function FloatingOrbs() {
  return (
    <div aria-hidden className="lyra-orb-field pointer-events-none absolute inset-0 overflow-hidden">
      <span className="lyra-orb lyra-orb--a" />
      <span className="lyra-orb lyra-orb--b" />
      <span className="lyra-orb lyra-orb--c" />
      <span className="lyra-scanline" />
      <span className="lyra-ring-3d lyra-ring-3d--outer" />
      <span className="lyra-ring-3d lyra-ring-3d--mid" />
      <span className="lyra-ring-3d lyra-ring-3d--inner" />
    </div>
  );
}
