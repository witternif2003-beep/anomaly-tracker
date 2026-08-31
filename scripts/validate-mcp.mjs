#!/usr/bin/env node
// Structural check on .cursor/mcp.json: every server has a launch command, secret
// values are `${PLACEHOLDER}` references rather than literals, and each referenced
// variable exists in .env.example. Reads no secrets and makes no network calls, so
// it is safe to run in CI and in builds.

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const configPath = resolve(root, ".cursor/mcp.json");
const envExamplePath = resolve(root, ".env.example");

if (!existsSync(configPath)) {
  console.error("MCP FAIL .cursor/mcp.json missing");
  process.exit(1);
}

const servers = JSON.parse(readFileSync(configPath, "utf8")).mcpServers || {};
const names = Object.keys(servers);
if (names.length === 0) {
  console.error("MCP FAIL no servers defined in .cursor/mcp.json");
  process.exit(1);
}

const declared = existsSync(envExamplePath)
  ? new Set(
      readFileSync(envExamplePath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split("=")[0])
    )
  : new Set();

const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g;
const SECRETISH = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/;

const errors = [];
const needsEnv = [];
const ready = [];

for (const [name, server] of Object.entries(servers)) {
  if (typeof server.command !== "string" || !server.command) {
    errors.push(`${name}: missing "command"`);
    continue;
  }

  const values = [...(server.args || []), ...Object.values(server.env || {})].filter(
    (value) => typeof value === "string"
  );

  const vars = new Set();
  for (const value of values) {
    for (const [, variable] of value.matchAll(PLACEHOLDER)) vars.add(variable);
  }

  for (const [key, value] of Object.entries(server.env || {})) {
    if (SECRETISH.test(key) && typeof value === "string" && value && !value.includes("${")) {
      errors.push(`${name}: env ${key} holds a literal value — use \${${key}}`);
    }
  }

  for (const variable of vars) {
    if (!declared.has(variable)) {
      errors.push(`${name}: \${${variable}} is not declared in .env.example`);
    }
  }

  (vars.size ? needsEnv : ready).push(vars.size ? `${name} (${[...vars].join(", ")})` : name);
}

if (errors.length) {
  for (const error of errors) console.error(`MCP FAIL ${error}`);
  process.exit(1);
}

console.log(`MCP OK   ${names.length} servers in .cursor/mcp.json`);
if (ready.length) console.log(`MCP FREE ${ready.join(", ")}`);
if (needsEnv.length) console.log(`MCP ENV  ${needsEnv.join(", ")}`);
