import { handle, json } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { env } from "@/lib/env";

export const GET = handle(async () => {
  const address = env.sessionSecret.length >= 32 ? await currentUser() : null;
  return json({ address });
});
