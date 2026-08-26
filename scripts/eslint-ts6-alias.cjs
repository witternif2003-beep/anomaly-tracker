"use strict";

// typescript-eslint still needs the TypeScript 6 compiler API.
// Next.js 16.3.2 typechecks with TypeScript 7's `tsc` CLI.
const Module = require("module");
const original = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "typescript") {
    return original.call(this, "@typescript/typescript6", parent, isMain, options);
  }
  return original.call(this, request, parent, isMain, options);
};
