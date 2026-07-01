import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { healthRoutes } from "./routes/health.js";
import { askRoutes } from "./routes/ask.js";
import { lmtmDashboardDeployRoutes } from "./routes/dashboards.js";
import { metaRoutes } from "./routes/meta.js";
import { metaSyncRoutes } from "./routes/meta-sync.js";
import { adsRoutes } from "./routes/ads.js";
import { clickupWebhookRoutes } from "./routes/clickup-webhook.js";
import { financeRoutes } from "./routes/finance.js";
import { agentToolsRoutes } from "./routes/agent-tools.js";
import { publicDashboardRoutes } from "./routes/public-dashboards.js";
import { agentChatRoutes } from "./routes/agent-chat.js";
import { waBotRoutes } from "./routes/wa-bot.js";
import { initWaBot } from "./services/wa-group-bot.js";
import { initAgencyOps } from "./services/agency-ops.js";
import { initAdsAutoSync } from "./services/ads-autosync.js";
import { initBalanceMonitor } from "./services/balance-monitor.js";
import { initCustomerBrain } from "./services/customer-brain.js";
import { initAccountScoring } from "./services/account-scoring.js";
import { initKnowledgeGraph } from "./services/knowledge-graph.js";
import { initLearningEngine } from "./services/learning-engine.js";
import { initAuditor } from "./services/auditor.js";
import { initFeedbackAgent } from "./services/feedback-agent.js";
import { initOpportunities } from "./services/opportunities-engine.js";
import { companyRoutes } from "./routes/companies.js";
import { companySkillRoutes } from "./routes/company-skills.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { issueRoutes } from "./routes/issues.js";
import { issueTreeControlRoutes } from "./routes/issue-tree-control.js";
import { routineRoutes } from "./routes/routines.js";
import { environmentRoutes } from "./routes/environments.js";
import { executionWorkspaceRoutes } from "./routes/execution-workspaces.js";
import { goalRoutes } from "./routes/goals.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { userProfileRoutes } from "./routes/user-profiles.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { sidebarPreferenceRoutes } from "./routes/sidebar-preferences.js";
import { inboxDismissalRoutes } from "./routes/inbox-dismissals.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import {
  instanceDatabaseBackupRoutes,
  type InstanceDatabaseBackupService,
} from "./routes/instance-database-backups.js";
import { llmRoutes } from "./routes/llms.js";
import { authRoutes } from "./routes/auth.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { pluginRoutes } from "./routes/plugins.js";
import { adapterRoutes } from "./routes/adapters.js";
import { pluginUiStaticRoutes } from "./routes/plugin-ui-static.js";
import { applyUiBranding } from "./ui-branding.js";
import { logger } from "./middleware/logger.js";
import { DEFAULT_LOCAL_PLUGIN_DIR, pluginLoader } from "./services/plugin-loader.js";
import { createPluginWorkerManager, type PluginWorkerManager } from "./services/plugin-worker-manager.js";
import { createPluginJobScheduler } from "./services/plugin-job-scheduler.js";
import { pluginJobStore } from "./services/plugin-job-store.js";
import { createPluginToolDispatcher } from "./services/plugin-tool-dispatcher.js";
import { pluginLifecycleManager } from "./services/plugin-lifecycle.js";
import { createPluginJobCoordinator } from "./services/plugin-job-coordinator.js";
import { buildHostServices, flushPluginLogBuffer } from "./services/plugin-host-services.js";
import { createPluginEventBus } from "./services/plugin-event-bus.js";
import { setPluginEventBus } from "./services/activity-log.js";
import { createPluginDevWatcher } from "./services/plugin-dev-watcher.js";
import { createPluginHostServiceCleanup } from "./services/plugin-host-service-cleanup.js";
import { pluginRegistryService } from "./services/plugin-registry.js";
import { createHostClientHandlers } from "@paperclipai/plugin-sdk";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
import { createCachedViteHtmlRenderer } from "./vite-html-renderer.js";

type UiMode = "none" | "static" | "vite-dev";
const FEEDBACK_EXPORT_FLUSH_INTERVAL_MS = 5_000;
const VITE_DEV_ASSET_PREFIXES = [
  "/@fs/",
  "/@id/",
  "/@react-refresh",
  "/@vite/",
  "/assets/",
  "/node_modules/",
  "/src/",
];
const VITE_DEV_STATIC_PATHS = new Set([
  "/apple-touch-icon.png",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon.ico",
  "/favicon.svg",
  "/site.webmanifest",
  "/sw.js",
]);

export function resolveViteHmrPort(serverPort: number): number {
  if (serverPort <= 55_535) {
    return serverPort + 10_000;
  }
  return Math.max(1_024, serverPort - 10_000);
}

export function shouldServeViteDevHtml(req: ExpressRequest): boolean {
  const pathname = req.path;
  if (VITE_DEV_STATIC_PATHS.has(pathname)) return false;
  if (VITE_DEV_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  return req.accepts(["html"]) === "html";
}

export function shouldEnablePrivateHostnameGuard(opts: {
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
}): boolean {
  return (
    opts.deploymentExposure === "private" &&
    (opts.deploymentMode === "local_trusted" || opts.deploymentMode === "authenticated")
  );
}

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    storageService: StorageService;
    feedbackExportService?: {
      flushPendingFeedbackTraces(input?: {
        companyId?: string;
        traceId?: string;
        limit?: number;
        now?: Date;
      }): Promise<unknown>;
    };
    databaseBackupService?: InstanceDatabaseBackupService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    localPluginDir?: string;
    pluginMigrationDb?: Db;
    pluginWorkerManager?: PluginWorkerManager;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
  },
) {
  const app = express();

  app.use(express.json({
    // Company import/export payloads can inline full portable packages.
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }));
  app.use(httpLogger);

  // CORS for public panel + simple /ask MiniMax bridge (mounted before auth gate).
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(askRoutes());

  const privateHostnameGateEnabled = shouldEnablePrivateHostnameGuard({
    deploymentMode: opts.deploymentMode,
    deploymentExposure: opts.deploymentExposure,
  });
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );
  // Promote ?token= query param to Authorization header for browser-redirect OAuth flows
  // (browser navigations don't send Authorization headers)
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/meta/oauth/") && typeof req.query.token === "string" && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  });
  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
    }),
  );
  app.use("/api/auth", authRoutes(db));
  if (opts.betterAuthHandler) {
    app.all("/api/auth/{*authPath}", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));
  // ClickUp webhook (client auto-provisioning). Unauthenticated by design —
  // verified by HMAC over the raw body — so it sits before the authed router.
  app.use("/api/clickup", clickupWebhookRoutes(db));

  const hostServicesDisposers = new Map<string, () => void>();
  const workerManager = opts.pluginWorkerManager ?? createPluginWorkerManager();

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());
  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  api.use(metaRoutes(db));
  api.use(metaSyncRoutes(db));
  api.use(adsRoutes(db));
  api.use(financeRoutes(db));
  // Public dashboard routes (no auth required; auth is enforced per-route).
  // Mounted at /api/public so the URL space stays under /api.
  api.use("/public", publicDashboardRoutes(db));
  api.use("/companies", companyRoutes(db, opts.storageService));
  api.use(companySkillRoutes(db));
  api.use(agentRoutes(db, { pluginWorkerManager: workerManager }));
  api.use(assetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService, {
    feedbackExportService: opts.feedbackExportService,
    pluginWorkerManager: workerManager,
  }));
  api.use(issueTreeControlRoutes(db));
  api.use(routineRoutes(db, { pluginWorkerManager: workerManager }));
  api.use(environmentRoutes(db, { pluginWorkerManager: workerManager }));
  api.use(executionWorkspaceRoutes(db));
  api.use(goalRoutes(db));
  api.use(approvalRoutes(db, { pluginWorkerManager: workerManager }));
  api.use(secretRoutes(db));
  api.use(costRoutes(db, { pluginWorkerManager: workerManager }));
  api.use(activityRoutes(db));
  api.use(lmtmDashboardDeployRoutes());
  api.use(agentChatRoutes(db));
  api.use("/wa-bot", waBotRoutes(db));
  initWaBot(db).catch(() => {});
  initAgencyOps(db);
  try { initAdsAutoSync(db); } catch (e) { console.warn("[ads-autosync] init failed:", e); }
  // Low-balance alerts are now folded into the daily operational audit (one
  // report, not three). The standalone scheduler is left off so the team isn't
  // pinged twice; fetchAccountBalances/runBalanceCheck stay available for the
  // panel + on-demand routes.
  void initBalanceMonitor;
  // Intelligence layer (0107): brain, scores, KG, learnings, auditor, feedback, opportunities.
  try {
    initCustomerBrain(db);
    initAccountScoring(db);
    initKnowledgeGraph(db);
    initLearningEngine(db);
    initAuditor(db);
    initFeedbackAgent(db);
    initOpportunities(db);
    // Auto-delegation: re-route issues stranded on the triage owner to the
    // matching specialist so work flows instead of piling on one agent.
    void (async () => {
      try {
        const { initIssueRouter } = await import("./services/issue-router.js");
        initIssueRouter(db);
      } catch (e) {
        console.warn("[issue-router] init failed:", e);
      }
    })();
    // Competitor-driven content ideas: backfill on boot + weekly refresh so
    // every active client always has personalized pauta/posteo ideas.
    void (async () => {
      try {
        const { initContentIdeas } = await import("./services/competitor-content.js");
        initContentIdeas(db);
      } catch (e) {
        console.warn("[content-ideas] init failed:", e);
      }
    })();
    // Weekly growth roundtable: agents debate agency-level growth (automation,
    // upsell, efficiency, brand) on a recurring issue, invited by @mention.
    void (async () => {
      try {
        const { initGrowthRoundtable } = await import("./services/growth-roundtable.js");
        initGrowthRoundtable(db);
      } catch (e) {
        console.warn("[growth-roundtable] init failed:", e);
      }
    })();
    // Per-client Apps Script health: detect failing/stale Cronopost→ClickUp
    // scripts and file a fix task for an agent. Self-healing for the pipeline.
    void (async () => {
      try {
        const { initScriptHealth } = await import("./services/script-health.js");
        initScriptHealth(db);
      } catch (e) {
        console.warn("[script-health] init failed:", e);
      }
    })();
    // Anti-saturation safety net: reap zombie "running" runs that block the
    // global concurrency cap and freeze the queue.
    void (async () => {
      try {
        const { initStaleRunReaper } = await import("./services/stale-run-reaper.js");
        initStaleRunReaper(db);
      } catch (e) {
        console.warn("[stale-run-reaper] init failed:", e);
      }
    })();
    // One-shot Sheets mapping sweep on boot: picks up the per-client planning
    // Sheet for clients that haven't been mapped yet. Fails silently if Google
    // OAuth isn't configured (e.g. local dev).
    void (async () => {
      try {
        const { autoDetectAllMissingSheets } = await import("./services/sheets-mapping.js");
        const r = await autoDetectAllMissingSheets(db);
        console.log(`[sheets-mapping] boot sweep: ${r.detected}/${r.clients} detected (${r.errors} errors)`);
      } catch (e) {
        console.log(`[sheets-mapping] boot sweep skipped: ${e instanceof Error ? e.message : e}`);
      }
    })();
  } catch (e) {
    console.warn("[intelligence] init failed:", e);
  }
  api.use(dashboardRoutes(db));
  api.use(userProfileRoutes(db));
  api.use(sidebarBadgeRoutes(db));
  api.use(sidebarPreferenceRoutes(db));
  api.use(inboxDismissalRoutes(db));
  api.use(instanceSettingsRoutes(db));
  if (opts.databaseBackupService) {
    api.use(instanceDatabaseBackupRoutes(opts.databaseBackupService));
  }
  const pluginRegistry = pluginRegistryService(db);
  const eventBus = createPluginEventBus();
  setPluginEventBus(eventBus);
  const jobStore = pluginJobStore(db);
  const lifecycle = pluginLifecycleManager(db, { workerManager });
  const scheduler = createPluginJobScheduler({
    db,
    jobStore,
    workerManager,
  });
  const toolDispatcher = createPluginToolDispatcher({
    workerManager,
    lifecycleManager: lifecycle,
    db,
  });
  const jobCoordinator = createPluginJobCoordinator({
    db,
    lifecycle,
    scheduler,
    jobStore,
  });
  const hostServiceCleanup = createPluginHostServiceCleanup(lifecycle, hostServicesDisposers);
  let viteHtmlRenderer: ReturnType<typeof createCachedViteHtmlRenderer> | null = null;
  const loader = pluginLoader(
    db,
    {
      localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR,
      migrationDb: opts.pluginMigrationDb,
    },
    {
      workerManager,
      eventBus,
      jobScheduler: scheduler,
      jobStore,
      toolDispatcher,
      lifecycleManager: lifecycle,
      instanceInfo: {
        instanceId: opts.instanceId ?? "default",
        hostVersion: opts.hostVersion ?? "0.0.0",
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
      },
      buildHostHandlers: (pluginId, manifest) => {
        const notifyWorker = (method: string, params: unknown) => {
          const handle = workerManager.getWorker(pluginId);
          if (handle) handle.notify(method, params);
        };
        const services = buildHostServices(db, pluginId, manifest.id, eventBus, notifyWorker, {
          pluginWorkerManager: workerManager,
          manifest,
        });
        hostServicesDisposers.set(pluginId, () => services.dispose());
        return createHostClientHandlers({
          pluginId,
          capabilities: manifest.capabilities,
          services,
        });
      },
    },
  );
  api.use(
    pluginRoutes(
      db,
      loader,
      { scheduler, jobStore },
      { workerManager },
      { toolDispatcher },
      { workerManager },
    ),
  );
  // Agent tool executor (minimax_local loop calls back into this with its JWT).
  api.use(agentToolsRoutes(db, { toolDispatcher }));
  api.use(adapterRoutes());
  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      bindHost: opts.bindHost,
      allowedHostnames: opts.allowedHostnames,
    }),
  );
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  app.use(pluginUiStaticRoutes(db, {
    localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR,
  }));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"));
      // Hashed asset files (Vite emits them under /assets/<name>.<hash>.<ext>)
      // never change once built, so they can be cached aggressively.
      app.use(
        "/assets",
        express.static(path.join(uiDist, "assets"), {
          maxAge: "1y",
          immutable: true,
        }),
      );
      // Non-hashed static files (favicon.ico, manifest, robots.txt, etc.):
      // short cache so operators who swap them out see the new version
      // reasonably fast. Override for `index.html` specifically — it is
      // served by this middleware for `/` and `/index.html`, and it must
      // never outlive the asset hashes it points at.
      app.use(
        express.static(uiDist, {
          maxAge: "1h",
          setHeaders(res, filePath) {
            if (path.basename(filePath) === "index.html") {
              res.set("Cache-Control", "no-cache");
            }
          },
        }),
      );
      // SPA fallback. Only for non-asset routes — if the browser asks for
      // /assets/something.js that doesn't exist, we must NOT serve the HTML
      // shell: the browser would try to load it as a JavaScript module, fail
      // with a MIME-type error, and cache that broken response. Return 404
      // instead. The index.html response itself is no-cache so a subsequent
      // deploy's updated asset hashes are picked up on next load.
      app.get(/.*/, (req, res) => {
        if (req.path.startsWith("/assets/")) {
          res.status(404).end();
          return;
        }
        res
          .status(200)
          .set("Content-Type", "text/html")
          .set("Cache-Control", "no-cache")
          .end(indexHtml);
      });
    } else {
      console.warn("[paperclip] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const publicUiRoot = path.resolve(uiRoot, "public");
    const hmrPort = resolveViteHmrPort(opts.serverPort);
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: uiRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: {
          host: opts.bindHost,
          port: hmrPort,
          clientPort: hmrPort,
        },
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });
    viteHtmlRenderer = createCachedViteHtmlRenderer({
      vite,
      uiRoot,
      brandHtml: applyUiBranding,
    });
    const renderViteHtml = viteHtmlRenderer;

    if (fs.existsSync(publicUiRoot)) {
      app.use(express.static(publicUiRoot, { index: false }));
    }
    app.get(/.*/, async (req, res, next) => {
      if (!shouldServeViteDevHtml(req)) {
        next();
        return;
      }
      try {
        const html = await renderViteHtml.render(req.originalUrl);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  }

  app.use(errorHandler);

  jobCoordinator.start();
  scheduler.start();
  const feedbackExportTimer = opts.feedbackExportService
    ? setInterval(() => {
      void opts.feedbackExportService?.flushPendingFeedbackTraces().catch((err) => {
        logger.error({ err }, "Failed to flush pending feedback exports");
      });
    }, FEEDBACK_EXPORT_FLUSH_INTERVAL_MS)
    : null;
  feedbackExportTimer?.unref?.();
  if (opts.feedbackExportService) {
    void opts.feedbackExportService.flushPendingFeedbackTraces().catch((err) => {
      logger.error({ err }, "Failed to flush pending feedback exports");
    });
  }
  void toolDispatcher.initialize().catch((err) => {
    logger.error({ err }, "Failed to initialize plugin tool dispatcher");
  });
  const devWatcher = opts.uiMode === "vite-dev"
    ? createPluginDevWatcher(
      lifecycle,
      async (pluginId) => (await pluginRegistry.getById(pluginId))?.packagePath ?? null,
    )
    : null;
  void loader.loadAll().then((result) => {
    if (!result) return;
    for (const loaded of result.results) {
      if (devWatcher && loaded.success && loaded.plugin.packagePath) {
        devWatcher.watch(loaded.plugin.id, loaded.plugin.packagePath);
      }
    }
  }).catch((err) => {
    logger.error({ err }, "Failed to load ready plugins on startup");
  });

  // LMTM-OS: auto-discover + auto-install plugins baked into the
  // runtime image. The plugin loader normally requires the admin to
  // install each plugin via the UI before `loadAll()` will pick it
  // up, but for our baked-in approach (Dockerfile copies plugins to
  // /app/.paperclip/plugins/) we want them registered automatically
  // on first boot. Idempotent: re-installs are no-ops because
  // installPlugin dedupes by packagePath.
  void (async () => {
    try {
      const discovered = await loader.discoverAll();
      if (discovered.discovered.length === 0) {
        logger.info(
          { localPluginDir: process.env.LMTM_LOCAL_PLUGIN_DIR },
          "lmtm: no local plugins discovered on startup",
        );
        return;
      }
      logger.info(
        { count: discovered.discovered.length, errors: discovered.errors.length },
        "lmtm: discovered local plugins on startup, installing",
      );
      for (const plugin of discovered.discovered) {
        if (!plugin.packagePath) continue;
        try {
          await loader.installPlugin({ localPath: plugin.packagePath });
          logger.info(
            { packageName: plugin.packageName, manifestId: plugin.manifest?.id },
            "lmtm: auto-installed bundled plugin",
          );
        } catch (e) {
          // "Plugin already installed" (HTTP 409) is the expected idempotent
          // case on every boot — not an error worth alarming on.
          const status = (e as { status?: number })?.status;
          if (status === 409) {
            logger.info(
              { packageName: plugin.packageName },
              "lmtm: bundled plugin already installed (skipping)",
            );
          } else {
            logger.error(
              { err: e, packageName: plugin.packageName },
              "lmtm: failed to auto-install bundled plugin",
            );
          }
        }
      }
      // After installs, the plugins are in "installed" status. We
      // also need to transition them to "ready" so loadAll picks
      // them up. lifecycle.load() does that.
      // LMTM-OS: also handle "uninstalled" status (e.g. after a
      // soft-delete via DELETE /api/plugins/:id). installPlugin()
      // reuses the existing row and sets status to "installed",
      // but if the row is missing entirely (e.g. after purge=true)
      // installPlugin() will insert a fresh "installed" row.
      const newPluginIds: string[] = [];
      for (const plugin of discovered.discovered) {
        const existing = await pluginRegistry.getByKey(plugin.manifest?.id ?? "");
        if (existing && (existing.status === "installed" || existing.status === "uninstalled")) {
          try {
            await lifecycle.load(existing.id);
            newPluginIds.push(existing.id);
          } catch (e) {
            logger.error(
              { err: e, pluginKey: plugin.manifest?.id, status: existing.status },
              "lmtm: failed to load bundled plugin after install",
            );
          }
        }
      }
      if (newPluginIds.length > 0) {
        logger.info(
          { count: newPluginIds.length, pluginIds: newPluginIds },
          "lmtm: bundled plugins ready",
        );
      }
    } catch (e) {
      logger.error({ err: e }, "lmtm: auto-install of bundled plugins failed");
    }
  })();
  process.once("exit", () => {
    if (feedbackExportTimer) clearInterval(feedbackExportTimer);
    devWatcher?.close();
    viteHtmlRenderer?.dispose();
    hostServiceCleanup.disposeAll();
    hostServiceCleanup.teardown();
  });
  process.once("beforeExit", () => {
    void flushPluginLogBuffer();
  });

  return app;
}
