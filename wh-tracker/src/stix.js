"use strict";

const { v5: uuidv5 } = require("uuid");

// Deterministic namespace so re-running a pipeline produces stable STIX ids.
const NAMESPACE = "9b7f6a1e-3b2c-4f5a-8c2d-2f4b6d8e0a11";

function deterministicId(type, seed) {
  return `${type}--${uuidv5(`${type}:${seed}`, NAMESPACE)}`;
}

function identity(name, sector) {
  return {
    type: "identity",
    spec_version: "2.1",
    id: deterministicId("identity", name),
    created: "2024-01-01T00:00:00.000Z",
    modified: "2024-01-01T00:00:00.000Z",
    name,
    identity_class: "organization",
    sectors: sector ? [sector] : undefined,
  };
}

function observedAnomaly(anomaly) {
  const now = new Date().toISOString();
  return {
    type: "indicator",
    spec_version: "2.1",
    id: deterministicId("indicator", anomaly.id),
    created: anomaly.detectedAt || now,
    modified: now,
    name: anomaly.title,
    description: anomaly.detail || "",
    indicator_types: ["anomalous-activity"],
    pattern_type: "stix",
    pattern: `[x-wh-anomaly:score > ${Math.max(0, Number(anomaly.score) || 0) - 1}]`,
    valid_from: anomaly.detectedAt || now,
    labels: [anomaly.severity, anomaly.source].filter(Boolean),
    confidence: Math.min(100, Math.round(Number(anomaly.score) || 0)),
  };
}

function relationship(sourceRef, targetRef, kind) {
  const now = new Date().toISOString();
  return {
    type: "relationship",
    spec_version: "2.1",
    id: deterministicId("relationship", `${sourceRef}|${targetRef}|${kind}`),
    created: now,
    modified: now,
    relationship_type: kind,
    source_ref: sourceRef,
    target_ref: targetRef,
  };
}

function bundle(objects) {
  return {
    type: "bundle",
    id: `bundle--${uuidv5(JSON.stringify(objects.map((o) => o.id)), NAMESPACE)}`,
    objects: objects.filter(Boolean),
  };
}

module.exports = { bundle, identity, observedAnomaly, relationship, deterministicId };
