"use strict";

const fs = require("fs");
const path = require("path");

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "..", "logs");

function ensureDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

const canWrite = ensureDir();

function write(level, service, message, fields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    ...(fields || {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
  if (canWrite) {
    try {
      fs.appendFileSync(path.join(LOG_DIR, `${service}.log`), line + "\n");
    } catch {
      /* logging must never break the request path */
    }
  }
}

function createLogger(service) {
  return {
    info: (message, fields) => write("info", service, message, fields),
    warn: (message, fields) => write("warn", service, message, fields),
    error: (message, fields) => write("error", service, message, fields),
  };
}

module.exports = { createLogger, LOG_DIR };
