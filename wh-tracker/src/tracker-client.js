"use strict";

const axios = require("axios");

function createTrackerClient({ baseUrl, apiKey } = {}) {
  const http = axios.create({
    baseURL: baseUrl || process.env.TRACKER_URL || "http://localhost:3000",
    timeout: 15000,
    headers: { "x-api-key": apiKey || process.env.API_KEY || "" },
  });

  return {
    async health() {
      const { data } = await http.get("/api/health");
      return data;
    },
    async upsertEntity(entity) {
      const { data } = await http.post("/api/entities", entity);
      return data;
    },
    async upsertLink(link) {
      const { data } = await http.post("/api/links", link);
      return data;
    },
    async addAnomaly(anomaly) {
      const { data } = await http.post("/api/anomalies", anomaly);
      return data;
    },
  };
}

module.exports = { createTrackerClient };
