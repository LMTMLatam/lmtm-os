// TEMP — reproduce computeClientScore failure with full stack. Delete after use.
import { createDb } from "./dist/index.js";
import { computeClientScore } from "../../server/dist/services/account-scoring.js";

const db = createDb(process.env.DATABASE_URL);
try {
  const r = await computeClientScore(db, "d5caad1a-a8b5-4b49-b855-f48730d4642c"); // RICCI
  console.log("OK:", JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log("ERROR:", e.message?.slice(0, 200));
  console.log("CAUSE:", e.cause?.message?.slice(0, 200) ?? "(sin cause)");
  console.log("STACK:", e.stack?.split("\n").slice(0, 5).join("\n"));
}
process.exit(0);
