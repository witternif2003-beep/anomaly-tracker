// Error-queue widget. Renders a scout's queue into any container, so the same
// code backs the panel inside the viewer and the standalone /errors.html page
// (which is also embeddable as an iframe).

const KIND_LABEL = {
  exception: "runtime",
  rejection: "promise",
  request: "request",
  resource: "resource",
  probe: "probe",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export function mountErrorQueue({ scout, list, count, clearButton }) {
  const render = (entries) => {
    if (count) {
      const total = entries.reduce((sum, e) => sum + e.count, 0);
      count.textContent = total;
      count.dataset.state = total ? "errors" : "clear";
    }
    if (!list) return;
    if (!entries.length) {
      list.innerHTML = '<p class="empty">No errors observed this session.</p>';
      return;
    }
    list.innerHTML = entries
      .map(
        (entry) => `<article class="error ${escapeHtml(entry.severity)}">
          <div class="title">${escapeHtml(entry.message)}</div>
          <div class="row">${escapeHtml(KIND_LABEL[entry.kind] || entry.kind)} &middot; ${escapeHtml(
          entry.source
        )}${entry.count > 1 ? ` &middot; ×${entry.count}` : ""} &middot; ${escapeHtml(
          new Date(entry.lastSeen).toLocaleTimeString()
        )}</div>
          ${entry.detail ? `<div class="row">${escapeHtml(entry.detail)}</div>` : ""}
        </article>`
      )
      .join("");
  };

  clearButton?.addEventListener("click", () => scout.clear());
  return scout.subscribe(render);
}
