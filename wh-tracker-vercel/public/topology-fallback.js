// Fallback topology renderer for browsers where the WebGL scene cannot start
// (hardware acceleration off, blocked GPU, software rendering disabled). It draws
// into SVG rather than a canvas context: a canvas that already had a failed WebGL
// context request can refuse a 2D context, and SVG needs no context at all, so
// this path works wherever the DOM does.

const SEVERITY_HEX = {
  critical: "#e2504b",
  high: "#f0762f",
  medium: "#e0b13c",
  low: "#3ad07f",
  info: "#4b8ed0",
  none: "#5f7488",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = { w: 1000, h: 700 };

// Front elevation of the residence: central block, balustrade, North Portico
// columns and pediment, wings and flagpole.
function housePaths() {
  const cx = VIEW.w / 2;
  const cy = VIEW.h / 2;
  const block = { w: 300, h: 124 };
  const left = cx - block.w / 2;
  const top = cy - block.h / 2;
  const shapes = [
    ["rect", { x: left, y: top, width: block.w, height: block.h }],
    ["rect", { x: left - 8, y: top - 12, width: block.w + 16, height: 12 }],
    ["rect", { x: left - 156, y: top + 36, width: 156, height: block.h - 36 }],
    ["rect", { x: left + block.w, y: top + 36, width: 156, height: block.h - 36 }],
  ];
  for (let i = 0; i < 6; i += 1) {
    shapes.push(["rect", { x: cx - 90 + i * 36, y: top + 16, width: 10, height: block.h - 16 }]);
  }
  shapes.push([
    "path",
    { d: `M ${cx - 116} ${top + 16} L ${cx} ${top - 40} L ${cx + 116} ${top + 16} Z` },
  ]);
  shapes.push(["path", { d: `M ${cx} ${top - 40} L ${cx} ${top - 96}` }]);
  return shapes;
}

export function createFallbackTopology({ canvas, mount, getState, worstSeverity, tooltip }) {
  if (canvas) canvas.style.display = "none";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;background:#070a0f;touch-action:none;z-index:0;";
  svg.dataset.renderer = "svg";

  const house = document.createElementNS(SVG_NS, "g");
  house.setAttribute("stroke", "#6fd3ff");
  house.setAttribute("stroke-opacity", "0.6");
  house.setAttribute("fill", "none");
  for (const [tag, attrs] of housePaths()) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    house.appendChild(node);
  }

  const linkLayer = document.createElementNS(SVG_NS, "g");
  linkLayer.setAttribute("stroke", "rgba(120,150,180,0.35)");
  const nodeLayer = document.createElementNS(SVG_NS, "g");

  svg.append(house, linkLayer, nodeLayer);
  // Take the canvas' place in the DOM so the HUD panels keep stacking above it.
  if (canvas?.parentNode) canvas.parentNode.insertBefore(svg, canvas);
  else mount.appendChild(svg);

  let zoom = 1;

  function rebuild() {
    const state = getState();
    const entities = state.topology.entities || [];
    const links = state.topology.links || [];

    const degree = new Map(entities.map((e) => [e.id, 0]));
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    }

    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2;
    const radius = Math.min(cx, cy) * 0.82;
    const placed = new Map();
    entities.forEach((entity, i) => {
      const angle = (i / Math.max(entities.length, 1)) * Math.PI * 2 - Math.PI / 2;
      placed.set(entity.id, {
        entity,
        degree: degree.get(entity.id) || 0,
        severity: worstSeverity(entity.id),
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.78,
      });
    });

    linkLayer.replaceChildren();
    for (const link of links) {
      const a = placed.get(link.source);
      const b = placed.get(link.target);
      if (!a || !b) continue;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      linkLayer.appendChild(line);
    }

    nodeLayer.replaceChildren();
    for (const node of placed.values()) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", node.x);
      circle.setAttribute("cy", node.y);
      circle.setAttribute("r", 6 + Math.min(node.degree, 8) * 1.8);
      circle.setAttribute("fill", SEVERITY_HEX[node.severity] || SEVERITY_HEX.none);
      circle.setAttribute("fill-opacity", "0.9");
      circle.style.cursor = "pointer";

      const label = `${node.entity.label} · ${node.entity.kind} · ${node.degree} links · worst severity: ${
        node.severity
      }${node.entity.source ? ` · ${node.entity.source}` : ""}`;
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = label;
      circle.appendChild(title);

      if (tooltip) {
        circle.addEventListener("pointerenter", (event) => {
          tooltip.style.display = "block";
          tooltip.style.left = `${event.clientX + 12}px`;
          tooltip.style.top = `${event.clientY + 12}px`;
          tooltip.textContent = label;
        });
        circle.addEventListener("pointerleave", () => {
          tooltip.style.display = "none";
        });
      }
      nodeLayer.appendChild(circle);
    }
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom = Math.min(2.5, Math.max(0.5, zoom - event.deltaY * 0.001));
      const w = VIEW.w / zoom;
      const h = VIEW.h / zoom;
      svg.setAttribute("viewBox", `${(VIEW.w - w) / 2} ${(VIEW.h - h) / 2} ${w} ${h}`);
    },
    { passive: false }
  );

  return {
    mode: "svg",
    rebuild,
    start() {},
    toggleHouse() {
      const visible = house.style.display !== "none";
      house.style.display = visible ? "none" : "";
      return !visible;
    },
  };
}
