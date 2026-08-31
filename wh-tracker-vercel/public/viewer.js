import * as THREE from "/vendor/three.module.js";
import { createScout } from "/scout.js";
import { mountErrorQueue } from "/error-queue.js";
import { createFallbackTopology } from "/topology-fallback.js";

const SEVERITY_COLOR = {
  critical: 0xe2504b,
  high: 0xf0762f,
  medium: 0xe0b13c,
  low: 0x3ad07f,
  info: 0x4b8ed0,
  none: 0x5f7488,
};
const SEVERITY_RANK = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
const POLL_MS = 10000;
const SSE_OPEN_TIMEOUT_MS = 8000;
const REFERENCE_TIMEOUT_MS = 9000;

const scout = createScout({
  endpoints: ["/api/health", "/api/topology", "/api/reference-topology"],
});
mountErrorQueue({
  scout,
  list: document.getElementById("error-list"),
  count: document.getElementById("error-count"),
  clearButton: document.getElementById("error-clear"),
});
scout.start();

let state = { topology: { entities: [], links: [] }, anomalies: [], summary: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function formatTime(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : "time unknown";
}

function setStatus(kind, text) {
  const el = document.getElementById("status");
  el.className = kind;
  document.getElementById("status-text").textContent = text;
}

function worstSeverity(entityId) {
  let worst = "none";
  for (const a of state.anomalies) {
    if (a.entityId !== entityId) continue;
    if (worst === "none" || SEVERITY_RANK[a.severity] > SEVERITY_RANK[worst]) worst = a.severity;
  }
  return worst;
}

function renderHud() {
  const summary = state.summary || {};
  document.getElementById("kpi-entities").textContent = state.topology.entities.length;
  document.getElementById("kpi-links").textContent = state.topology.links.length;
  document.getElementById("kpi-anomalies").textContent = summary.anomalies ?? state.anomalies.length;
  document.getElementById("kpi-score").textContent = summary.maxScore ?? 0;

  const list = document.getElementById("feed-list");
  if (!state.anomalies.length) {
    list.innerHTML = '<p class="empty">No anomalies recorded.</p>';
    return;
  }
  list.innerHTML = state.anomalies
    .slice(0, 40)
    .map(
      (a) => `<article class="anomaly ${a.severity}">
        <div class="title">${escapeHtml(a.title)}</div>
        <div class="row">${escapeHtml(a.severity)} &middot; score ${escapeHtml(a.score)} &middot; ${escapeHtml(
        a.source
      )}</div>
        <div class="row">${escapeHtml(a.entityId || "unattributed")} &middot; ${escapeHtml(
        formatTime(a.detectedAt)
      )}</div>
      </article>`
    )
    .join("");
}

// The 3D scene is optional: WebGL can be unavailable (blocked, software-rendering
// disabled, hardened browser). Building it in one place lets the HUD, feed and
// error queue keep working when it throws instead of the whole script dying and
// leaving the viewer stuck on "connecting…" with zeroed counters.
// Phones (iOS Safari in particular) cap the GPU memory a WebGL context may
// claim, so a desktop-tuned context — devicePixelRatio 3, MSAA, an alpha buffer,
// a high-performance GPU request — is a common reason for "Error creating WebGL
// context" there. Ask for the cheapest context that still looks right, and retry
// once with everything off before giving up on 3D entirely.
const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

function createRenderer(canvas, antialias) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha: false,
    powerPreference: IS_MOBILE ? "low-power" : "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 2));
  return renderer;
}

function createScene() {
  const canvas = document.getElementById("scene");
  let renderer;
  try {
    renderer = createRenderer(canvas, !IS_MOBILE);
  } catch (err) {
    // Retry silently and only report if the cheaper context actually works —
    // otherwise the caller's own record is the single honest entry.
    renderer = createRenderer(canvas, false);
    scout.record({
      kind: "exception",
      message: `WebGL context needed reduced settings — ${err.message}`,
      detail: "multisampling raises the memory a context needs; the scene runs without it",
      source: "viewer",
    });
  }

  // A narrow viewport stacks the panels over the upper half of the screen, so
  // pull the camera back — otherwise the building alone fills what is left — and
  // push the fog out with it so the nodes do not fade into the background.
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = new THREE.Fog(0x070a0f, narrow ? 80 : 40, narrow ? 230 : 150);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  const rig = {
    radius: narrow ? 82 : 46,
    theta: 0.8,
    phi: 1.15,
    // aim above the graph on a narrow screen so it renders below the stacked panels
    target: new THREE.Vector3(0, narrow ? 16 : 0, 0),
  };

  scene.add(new THREE.AmbientLight(0x93a6bd, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(24, 34, 18);
  scene.add(key);

  const grid = new THREE.GridHelper(120, 24, 0x1d2a38, 0x121b25);
  grid.position.y = -18;
  scene.add(grid);

  const graph = new THREE.Group();
  scene.add(graph);

  // Wireframe White House at the centre of the telemetry sphere: residence
  // block, North Portico, balustrade, wings and flagpole, all drawn as line
  // geometry so entity nodes stay readable through it.
  const whiteHouse = (() => {
    const group = new THREE.Group();
    const line = new THREE.LineBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.55 });
    const faint = new THREE.LineBasicMaterial({ color: 0x3f6f92, transparent: true, opacity: 0.4 });

    const edges = (geometry, material, [x, y, z], rotation) => {
      const mesh = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), material);
      mesh.position.set(x, y, z);
      if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      group.add(mesh);
      return mesh;
    };
    const cage = (geometry, material, [x, y, z]) => {
      const mesh = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    edges(new THREE.BoxGeometry(17, 7, 8), line, [0, 0, 0]);
    edges(new THREE.BoxGeometry(17.6, 0.5, 8.6), faint, [0, 3.7, 0]); // balustrade
    edges(new THREE.BoxGeometry(15, 0.2, 8.6), faint, [0, 0.4, 0]); // floor band
    edges(new THREE.BoxGeometry(9, 5, 6), line, [-13, -1, 0]); // west wing
    edges(new THREE.BoxGeometry(9, 5, 6), line, [13, -1, 0]); // east wing

    // North Portico: pediment over six columns.
    const column = new THREE.CylinderGeometry(0.35, 0.35, 6, 8, 1, true);
    for (let i = 0; i < 6; i += 1) cage(column, line, [-4.5 + i * 1.8, -0.5, 5.4]);
    edges(new THREE.BoxGeometry(11.5, 0.6, 2.4), line, [0, 2.8, 5.4]);
    edges(new THREE.CylinderGeometry(0, 3.4, 1.8, 3), line, [0, 4, 5.4], [0, Math.PI / 2, 0]);

    // South Portico bow.
    edges(new THREE.CylinderGeometry(4, 4, 7, 16, 1, true), faint, [0, 0, -5]);

    const pole = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 3.7, 0),
      new THREE.Vector3(0, 9, 0),
    ]);
    group.add(new THREE.LineSegments(pole, line));

    group.scale.setScalar(1.15);
    scene.add(group);
    return group;
  })();

  const nodeGeometry = new THREE.SphereGeometry(1, 32, 24);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const tooltip = document.getElementById("tooltip");
  let nodeMeshes = [];

  function layout(entities, links) {
    const degree = new Map(entities.map((e) => [e.id, 0]));
    for (const l of links) {
      degree.set(l.source, (degree.get(l.source) || 0) + 1);
      degree.set(l.target, (degree.get(l.target) || 0) + 1);
    }
    const golden = Math.PI * (3 - Math.sqrt(5));
    const radius = Math.max(26, entities.length * 1.9);
    const positions = new Map();
    entities.forEach((entity, i) => {
      const y = entities.length === 1 ? 0 : 1 - (i / (entities.length - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      positions.set(
        entity.id,
        new THREE.Vector3(Math.cos(theta) * r * radius, y * radius * 0.6, Math.sin(theta) * r * radius)
      );
    });
    return { positions, degree };
  }

  function rebuild() {
    while (graph.children.length) {
      const child = graph.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    nodeMeshes = [];
    const { entities, links } = state.topology;
    const { positions, degree } = layout(entities, links);

    for (const link of links) {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      const material = new THREE.LineBasicMaterial({
        color: link.kind === "contribution" ? 0x4b8ed0 : 0x3c5468,
        transparent: true,
        opacity: 0.55,
      });
      graph.add(new THREE.Line(geometry, material));
    }

    for (const entity of entities) {
      const severity = worstSeverity(entity.id);
      const material = new THREE.MeshStandardMaterial({
        color: SEVERITY_COLOR[severity],
        emissive: severity === "none" ? 0x0a1118 : SEVERITY_COLOR[severity],
        emissiveIntensity: severity === "none" ? 0.05 : 0.35,
        roughness: 0.35,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(nodeGeometry, material);
      const scale = 0.9 + Math.min(degree.get(entity.id) || 0, 8) * 0.22;
      mesh.scale.setScalar(scale);
      mesh.position.copy(positions.get(entity.id));
      mesh.userData = { entity, severity, degree: degree.get(entity.id) || 0 };
      graph.add(mesh);
      nodeMeshes.push(mesh);
    }
  }

  let dragging = false;
  let last = { x: 0, y: 0 };
  const touches = new Map();
  let pinch = 0;

  const pinchSpan = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      dragging = false;
      pinch = pinchSpan();
      return;
    }
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = 0;
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointermove", (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;

    // Two pointers: pinch to zoom, matching the wheel handler's clamp.
    if (touches.size === 2 && pinch) {
      const span = pinchSpan();
      rig.radius = Math.min(140, Math.max(16, rig.radius * (pinch / (span || pinch))));
      pinch = span;
      return;
    }
    if (!dragging) return;
    rig.theta -= (e.clientX - last.x) * 0.005;
    rig.phi = Math.min(Math.PI - 0.15, Math.max(0.15, rig.phi - (e.clientY - last.y) * 0.005));
    last = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      rig.radius = Math.min(140, Math.max(16, rig.radius + e.deltaY * 0.05));
    },
    { passive: false }
  );

  function resize() {
    const { innerWidth: w, innerHeight: h } = window;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // A phone can drop the context after it was created (backgrounded tab, GPU
  // memory pressure). Without this the scene silently freezes; instead stop the
  // loop, record it and hand over to the flat renderer.
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    scout.record({
      kind: "exception",
      message: "WebGL context lost — switching to the flat topology",
      detail: "the GPU dropped the context after the scene was built (memory pressure or tab suspension)",
      source: "viewer",
    });
    mountFallback();
  });

  function tick() {
    if (contextLost) return;
    if (!dragging) rig.theta += 0.0008;
    camera.position.set(
      rig.radius * Math.sin(rig.phi) * Math.cos(rig.theta),
      rig.radius * Math.cos(rig.phi),
      rig.radius * Math.sin(rig.phi) * Math.sin(rig.theta)
    );
    camera.lookAt(rig.target);

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
    if (hit) {
      const { entity, severity, degree } = hit.object.userData;
      tooltip.style.display = "block";
      tooltip.innerHTML =
        `<b>${escapeHtml(entity.label)}</b><br>${escapeHtml(entity.kind)} &middot; ${degree} links<br>` +
        `worst severity: ${escapeHtml(severity)}` +
        (entity.source ? `<br>source: ${escapeHtml(entity.source)}` : "");
    } else {
      tooltip.style.display = "none";
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  return {
    mode: "webgl",
    rebuild,
    start: tick,
    toggleHouse() {
      whiteHouse.visible = !whiteHouse.visible;
      return whiteHouse.visible;
    },
    // Re-rendering in the same task keeps the drawing buffer readable without
    // paying for `preserveDrawingBuffer` on every frame.
    async snapshotBlob() {
      renderer.render(scene, camera);
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas encoding failed"))), "image/png");
      });
    },
  };
}

// `?render=2d` forces the fallback, which is how the 2D path is exercised on
// machines that do have WebGL.
const forced2d = new URLSearchParams(window.location.search).get("render") === "2d";

let scene3d = null;

function mountFallback() {
  try {
    scene3d = createFallbackTopology({
      canvas: document.getElementById("scene"),
      mount: document.body,
      getState: () => state,
      worstSeverity,
      tooltip: document.getElementById("tooltip"),
    });
    scene3d.rebuild();
    document.getElementById("controls-hint").textContent = "scroll to zoom · hover for details";
    document.getElementById("legend").insertAdjacentHTML(
      "afterbegin",
      '<div style="color:#e0b13c">WebGL unavailable — flat topology fallback. Enable hardware acceleration for the 3D scene.</div>'
    );
  } catch (fallbackErr) {
    scene3d = null;
    scout.record({
      kind: "exception",
      message: `topology fallback unavailable — ${fallbackErr.message}`,
      detail: "HUD, anomaly feed and error queue still update",
      source: "viewer",
    });
    document.getElementById("scene").style.display = "none";
    document.getElementById("legend").insertAdjacentHTML(
      "afterbegin",
      '<div style="color:#e2504b">Topology rendering unavailable in this browser. Data panels still update.</div>'
    );
  }
}

try {
  if (forced2d) throw new Error("2D rendering requested via ?render=2d");
  scene3d = createScene();
} catch (err) {
  if (!forced2d) {
    scout.record({
      kind: "exception",
      message: `3D scene unavailable — ${err.message}`,
      detail: "WebGL context or Three.js initialisation failed; falling back to the flat SVG topology",
      source: "viewer",
    });
  }
  mountFallback();
}

function applySnapshot(message) {
  state = {
    topology: message.topology || { entities: [], links: [] },
    anomalies: message.anomalies || [],
    summary: message.summary,
  };
  document.getElementById("source-label").textContent = message.reference
    ? message.label || "reference topology · USAspending"
    : "entity topology · live";
  scene3d?.rebuild();
  renderHud();
}

// An empty store (no Neon, fresh instance) would render a blank canvas, so fall
// back to the USAspending-derived reference topology. The live snapshot is drawn
// first so the scene is never blank while that upstream call is cold, and the
// reference call is bounded so a hanging upstream cannot freeze the viewer.
async function fetchSnapshot() {
  const res = await fetch("/api/topology?limit=50", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const snapshot = await res.json();
  applySnapshot(snapshot);
  if ((snapshot.topology?.entities || []).length > 3 || snapshot.anomalies?.length) return;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REFERENCE_TIMEOUT_MS);
  try {
    const reference = await fetch("/api/reference-topology", { signal: abort.signal });
    if (!reference.ok) throw new Error(`HTTP ${reference.status}`);
    applySnapshot(await reference.json());
  } catch (err) {
    scout.record({
      kind: "request",
      message: `/api/reference-topology unavailable — ${err.message}`,
      detail: "keeping the live snapshot on screen",
      source: "api",
    });
  } finally {
    clearTimeout(timer);
  }
}

// Fallback for clients where text/event-stream never arrives (buffering proxies,
// EventSource-less environments): poll the read-only snapshot.
function startPolling(reason) {
  if (startPolling.timer) return;
  setStatus("polling", `polling · ${reason}`);
  const poll = () =>
    fetchSnapshot()
      .then(() => setStatus("polling", `polling · ${reason}`))
      .catch((err) => setStatus("down", `offline: ${err.message}`));
  startPolling.timer = setInterval(poll, POLL_MS);
  poll();
}

// Serverless functions are request-scoped, so the stream is SSE and ends at the
// platform duration limit; reconnect on both `reconnect` and transport errors.
// Repeated failures before a single successful event mean SSE is unusable here.
let sseFailures = 0;
function connect() {
  if (typeof EventSource === "undefined") {
    startPolling("SSE unsupported");
    return;
  }
  const source = new EventSource("/api/sse/stream");
  let done = false;
  let opened = false;
  let openTimer;
  const restart = (text) => {
    if (done) return;
    done = true;
    clearTimeout(openTimer);
    source.close();
    if (opened) sseFailures = 0;
    else if (++sseFailures >= 2) {
      scout.record({
        kind: "probe",
        message: "/api/sse/stream never opened — falling back to polling",
        source: "scout",
      });
      startPolling("SSE blocked");
      return;
    }
    setStatus("down", text);
    setTimeout(connect, 1000);
  };
  openTimer = setTimeout(() => restart("stream timed out"), SSE_OPEN_TIMEOUT_MS);

  source.addEventListener("open", () => setStatus("live", "live"));
  source.addEventListener("snapshot", (event) => {
    opened = true;
    sseFailures = 0;
    clearTimeout(openTimer);
    setStatus("live", "live");
    const snapshot = JSON.parse(event.data);
    // Keep the reference topology on screen rather than replacing it with an
    // empty live snapshot.
    if ((snapshot.topology?.entities || []).length > 3 || snapshot.anomalies?.length) {
      applySnapshot(snapshot);
    }
  });
  source.addEventListener("reconnect", () => restart("reconnecting…"));
  source.addEventListener("error", () => restart("reconnecting…"));
}

const toggleHouse = () => {
  if (!scene3d) return;
  scene3d.toggleHouse();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") toggleHouse();
});
document.getElementById("toggle-house").addEventListener("click", toggleHouse);

// Export whatever is actually on screen — the WebGL frame or the flat SVG — so a
// snapshot carries the same data and source label as the viewer.
const exportButton = document.getElementById("export-png");
exportButton.addEventListener("click", async () => {
  if (!scene3d?.snapshotBlob) return;
  const label = exportButton.textContent;
  exportButton.disabled = true;
  exportButton.textContent = "exporting…";
  try {
    const blob = await scene3d.snapshotBlob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wh-topology-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
    // Safari aborts the download if the blob URL is revoked in the same task.
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  } catch (err) {
    scout.record({
      kind: "exception",
      message: `topology export failed — ${err.message}`,
      detail: "the on-screen renderer could not be encoded to PNG in this browser",
      source: "viewer",
    });
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = label;
  }
});

fetchSnapshot()
  .then(() => connect())
  .catch((err) => startPolling(`retrying after ${err.message}`))
  .finally(() => scene3d?.start());
