export const SESSION_COOKIE = "synapse_node_session";
export const PROMPT_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED"] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];
