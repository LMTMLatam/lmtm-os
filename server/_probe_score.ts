// TEMP — reproduce computeClientScore 500 locally with full stack. Delete after use.
import { createDb } from "@paperclipai/db";
import { computeClientScore } from "./src/services/account-scoring.js";

const db = createDb(process.env.DATABASE_URL!);
try {
  const r = await computeClientScore(db, "d5caad1a-a8b5-4b49-b855-f48730d4642c"); // RICCI
  console.log("OK:", JSON.stringify(r).slice(0, 300));
} catch (e) {
  const err = e as Error & { cause?: Error };
  console.log("ERROR:", err.message?.slice(0, 300));
  console.log("CAUSE:", err.cause?.message?.slice(0, 300) ?? "(sin cause)");
  console.log("STACK:", err.stack?.split("\n").slice(0, 8).join("\n"));
}
process.exit(0);
