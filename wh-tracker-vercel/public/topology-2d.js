// 2D canvas fallback for browsers without a WebGL context (hardware acceleration
// off, blocked GPU, hardened profile). Same data, same severity colours and the
// same White House wireframe, drawn with the 2D context so the topology is still
// readable instead of showing an empty panel set.

const SEVERITY_HEX = {
  critical: "#e2504b",
  high: "#f0762f",
  medium: "#e0b13c",
  low: "#3ad07f",
  info: "#4b8ed0",
  none: "#5f7488",
};

export function createFallback2D({ canvas, getState, worstSeverity, tooltip }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  let nodes = [];
  let links = [];
  let houseVisible = true;
  let hover = null;
  let scale = 1;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function rebuild() {
    const state = getState();
    const entities = state.topology.entities || [];
    links = state.topology.links || [];

    const degree = new Map(entities.map((e) => [e.id, 0]));
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    }

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const radius = Math.min(cx, cy) * 0.72;
    nodes = entities.map((entity, i) => {
      const angle = (i / Math.max(entities.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        entity,
        degree: degree.get(entity.id) || 0,
        severity: worstSeverity(entity.id),
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.78,
      };
    });
    draw();
  }

  function drawHouse(cx, cy) {
    // Front elevation of the residence: central block, balustrade, North Portico
    // columns with pediment, and the two wings.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "rgba(111, 211, 255, 0.6)";
    ctx.lineWidth = 1;

    const block = { w: 150, h: 62 };
    ctx.strokeRect(-block.w / 2, -block.h / 2, block.w, block.h);
    ctx.strokeRect(-block.w / 2 - 4, -block.h / 2 - 6, block.w + 8, 6); // balustrade
    ctx.strokeRect(-block.w / 2 - 78, -block.h / 2 + 18, 78, block.h - 18); // west wing
    ctx.strokeRect(block.w / 2, -block.h / 2 + 18, 78, block.h - 18); // east wing

    for (let i = 0; i < 6; i += 1) {
      const x = -45 + i * 18;
      ctx.strokeRect(x, -block.h / 2 + 8, 5, block.h - 8);
    }
    ctx.beginPath();
    ctx.moveTo(-58, -block.h / 2 + 8);
    ctx.lineTo(0, -block.h / 2 - 20);
    ctx.lineTo(58, -block.h / 2 + 8);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath(); // flagpole
    ctx.moveTo(0, -block.h / 2 - 20);
    ctx.lineTo(0, -block.h / 2 - 48);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070a0f";
    ctx.fillRect(0, 0, w, h);

    if (houseVisible) drawHouse(w / 2, h / 2);

    const byId = new Map(nodes.map((n) => [n.entity.id, n]));
    ctx.strokeStyle = "rgba(120, 150, 180, 0.35)";
    ctx.lineWidth = 1;
    for (const link of links) {
      const a = byId.get(link.source);
      const b = byId.get(link.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const node of nodes) {
      const r = 5 + Math.min(node.degree, 8) * 1.6;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = SEVERITY_HEX[node.severity] || SEVERITY_HEX.none;
      ctx.globalAlpha = node === hover ? 1 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  canvas.addEventListener("pointermove", (event) => {
    const found = nodes.find(
      (node) => Math.hypot(node.x - event.clientX, node.y - event.clientY) <= 8 + Math.min(node.degree, 8) * 1.6
    );
    if (found !== hover) {
      hover = found || null;
      draw();
    }
    if (!tooltip) return;
    if (!hover) {
      tooltip.style.display = "none";
      return;
    }
    const { entity, severity, degree } = hover;
    tooltip.style.display = "block";
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.textContent = `${entity.label} · ${entity.kind} · ${degree} links · worst severity: ${severity}${
      entity.source ? ` · ${entity.source}` : ""
    }`;
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      scale = Math.min(2.5, Math.max(0.4, scale - event.deltaY * 0.001));
      draw();
    },
    { passive: false }
  );

  window.addEventListener("resize", () => {
    resize();
    rebuild();
  });
  resize();

  return {
    mode: "2d",
    rebuild,
    start() {},
    toggleHouse() {
      houseVisible = !houseVisible;
      draw();
      return houseVisible;
    },
  };
}
