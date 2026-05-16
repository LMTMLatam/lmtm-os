import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { unauthorized, badRequest } from "../errors.js";
import type { Request } from "express";

const fileSchema = z.object({
  file: z.string().trim().min(1).max(200),
  data: z.string().max(2_000_000),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

const deployDashboardSchema = z.object({
  name: z.string().trim().min(1).max(60),
  html: z.string().min(1).max(2_000_000).optional(),
  files: z.array(fileSchema).max(40).optional(),
  target: z.enum(["preview", "production"]).default("production"),
}).refine((value) => Boolean(value.html) || Boolean(value.files?.length), {
  message: "Provide either html or files[].",
});

type DeployBody = z.infer<typeof deployDashboardSchema>;

function ensureBoardActor(req: Request) {
  if (req.actor.type !== "board" || !req.actor.userId) {
    throw unauthorized("Board authentication required");
  }
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "lmtm-dashboard";
}

function defaultIndex(name: string) {
  const safe = name.replace(/[<>]/g, "");
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safe}</title>
    <style>
      body { font: 14px/1.5 system-ui, sans-serif; background: #0a0a0a; color: #fafafa; margin: 0; padding: 2rem; }
      main { max-width: 720px; margin: 0 auto; }
      h1 { font-size: 1.5rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safe}</h1>
      <p>Dashboard pendiente de contenido — enviá <code>html</code> o <code>files[]</code> al deploy helper.</p>
    </main>
  </body>
</html>`;
}

interface VercelFilePayload {
  file: string;
  data: string;
  encoding?: "utf-8" | "base64";
}

async function vercelDeploy(params: {
  token: string;
  teamId?: string;
  projectName: string;
  files: VercelFilePayload[];
  target: "preview" | "production";
}): Promise<{ url: string; id: string; readyState?: string; raw: unknown }> {
  const body = {
    name: params.projectName,
    target: params.target,
    projectSettings: { framework: null },
    files: params.files,
  };
  const url = new URL("https://api.vercel.com/v13/deployments");
  url.searchParams.set("forceNew", "1");
  if (params.teamId) url.searchParams.set("teamId", params.teamId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      (raw as { error?: { message?: string } }).error?.message ??
      JSON.stringify(raw).slice(0, 400);
    throw new Error(`Vercel deploy failed (${response.status}): ${detail}`);
  }
  const deployment = raw as {
    id?: string;
    url?: string;
    readyState?: string;
    alias?: string[];
  };
  if (!deployment.id || !deployment.url) {
    throw new Error("Vercel deploy returned no id/url");
  }
  return {
    id: deployment.id,
    url: deployment.url,
    readyState: deployment.readyState,
    raw,
  };
}

export function lmtmDashboardDeployRoutes() {
  const router = Router();

  router.post("/dashboards/deploy", validate(deployDashboardSchema), async (req, res) => {
    ensureBoardActor(req);
    const body = req.body as DeployBody;
    const token = process.env.VERCEL_API_TOKEN?.trim();
    if (!token) {
      throw badRequest("VERCEL_API_TOKEN is not configured on the server");
    }
    const teamId = process.env.VERCEL_TEAM_ID?.trim();

    const files: VercelFilePayload[] = body.files?.length
      ? body.files
      : [{ file: "index.html", data: body.html ?? defaultIndex(body.name), encoding: "utf-8" }];

    const projectName = `lmtm-${slugify(body.name)}`;

    const deployment = await vercelDeploy({
      token,
      teamId: teamId || undefined,
      projectName,
      files,
      target: body.target,
    });

    res.status(201).json({
      id: deployment.id,
      projectName,
      target: body.target,
      url: `https://${deployment.url}`,
      readyState: deployment.readyState ?? "QUEUED",
    });
  });

  return router;
}
