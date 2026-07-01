// LMTM-OS schema barrel.
// New tables (0094-0096) are the canonical names; legacy "meta_*" names
// are kept as aliases so existing routes/services keep compiling while
// we migrate them in subsequent phases.

export { companies } from "./companies.js";
export { companyLogos } from "./company_logos.js";
export { authUsers, authSessions, authAccounts, authVerifications } from "./auth.js";
export { instanceSettings } from "./instance_settings.js";
export { instanceUserRoles } from "./instance_user_roles.js";
export { userSidebarPreferences } from "./user_sidebar_preferences.js";
export { agents } from "./agents.js";
export { boardApiKeys } from "./board_api_keys.js";
export { cliAuthChallenges } from "./cli_auth_challenges.js";
export { companyMemberships } from "./company_memberships.js";
export { companyUserSidebarPreferences } from "./company_user_sidebar_preferences.js";
export { principalPermissionGrants } from "./principal_permission_grants.js";
export { invites } from "./invites.js";
export { joinRequests } from "./join_requests.js";
export { budgetPolicies } from "./budget_policies.js";
export { budgetIncidents } from "./budget_incidents.js";
export { agentConfigRevisions } from "./agent_config_revisions.js";
export { agentApiKeys } from "./agent_api_keys.js";
export { agentRuntimeState } from "./agent_runtime_state.js";
export { agentTaskSessions } from "./agent_task_sessions.js";
export { agentWakeupRequests } from "./agent_wakeup_requests.js";
export { projects } from "./projects.js";
export { projectWorkspaces } from "./project_workspaces.js";
export { executionWorkspaces } from "./execution_workspaces.js";
export { environments } from "./environments.js";
export { environmentLeases } from "./environment_leases.js";
export { workspaceOperations } from "./workspace_operations.js";
export { workspaceRuntimeServices } from "./workspace_runtime_services.js";
export { projectGoals } from "./project_goals.js";
export { goals } from "./goals.js";
export { issues } from "./issues.js";
export { issueReferenceMentions } from "./issue_reference_mentions.js";
export { issueRelations } from "./issue_relations.js";
export { routines, routineRevisions, routineTriggers, routineRuns } from "./routines.js";
export { issueWorkProducts } from "./issue_work_products.js";
export { labels } from "./labels.js";
export { issueLabels } from "./issue_labels.js";
export { issueApprovals } from "./issue_approvals.js";
export { issueComments } from "./issue_comments.js";
export { issueThreadInteractions } from "./issue_thread_interactions.js";
export { issueTreeHolds } from "./issue_tree_holds.js";
export { issueTreeHoldMembers } from "./issue_tree_hold_members.js";
export { issueExecutionDecisions } from "./issue_execution_decisions.js";
export { issueInboxArchives } from "./issue_inbox_archives.js";
export { inboxDismissals } from "./inbox_dismissals.js";
export { feedbackVotes } from "./feedback_votes.js";
export { feedbackExports } from "./feedback_exports.js";
export { issueReadStates } from "./issue_read_states.js";
export { assets } from "./assets.js";
export { issueAttachments } from "./issue_attachments.js";
export { documents } from "./documents.js";
export { documentRevisions } from "./document_revisions.js";
export { issueDocuments } from "./issue_documents.js";
export { heartbeatRuns } from "./heartbeat_runs.js";
export { heartbeatRunEvents } from "./heartbeat_run_events.js";
export { heartbeatRunWatchdogDecisions } from "./heartbeat_run_watchdog_decisions.js";
export { costEvents } from "./cost_events.js";
export { financeEvents } from "./finance_events.js";
export { financeEntries } from "./finance_entries.js";
export { audienceDemographics } from "./audience_demographics.js";
export { videoReferences } from "./video_references.js";
export { approvals } from "./approvals.js";
export { approvalComments } from "./approval_comments.js";
export { activityLog } from "./activity_log.js";
export { companySecretProviderConfigs } from "./company_secret_provider_configs.js";
export { companySecrets } from "./company_secrets.js";
export { companySecretVersions } from "./company_secret_versions.js";
export { companySecretBindings } from "./company_secret_bindings.js";
export { secretAccessEvents } from "./secret_access_events.js";
export { companySkills } from "./company_skills.js";
export { plugins } from "./plugins.js";
export { pluginConfig } from "./plugin_config.js";
export { pluginCompanySettings } from "./plugin_company_settings.js";
export { pluginManagedResources } from "./plugin_managed_resources.js";
export { pluginState } from "./plugin_state.js";
export { pluginEntities } from "./plugin_entities.js";
export { pluginDatabaseNamespaces, pluginMigrations } from "./plugin_database.js";
export { pluginJobs, pluginJobRuns } from "./plugin_jobs.js";
export { pluginWebhookDeliveries } from "./plugin_webhooks.js";
export { pluginLogs } from "./plugin_logs.js";
export { waBotConfig, waGroupMessages, waGroupSummaries } from "./wa_bot.js";
export { waGroupConfig, waDailyDigests } from "./wa_bot_extras.js";
export { agentChatSessions } from "./agent_chat_sessions.js";

// LMTM-OS new tables (canonical, post-0094).
export { clients } from "./clients.js";
export type { Client, NewClient } from "./clients.js";
export { clientContextCache } from "./client_context_cache.js";
export type { ClientContextCache, NewClientContextCache } from "./client_context_cache.js";
export { adsInventoryCache } from "./ads_inventory_cache.js";
export type { AdsInventoryCache, NewAdsInventoryCache } from "./ads_inventory_cache.js";
// Intelligence layer (0107): Customer Brain, scores, feedback, content KG, learnings, opportunities.
export {
  clientMemory,
  accountScores,
  feedbackItems,
  contentPerformance,
  learnings,
  opportunities,
} from "./intelligence.js";
export type {
  ClientMemory, NewClientMemory,
  AccountScore, NewAccountScore,
  FeedbackItem, NewFeedbackItem,
  ContentPerformance, NewContentPerformance,
  Learning, NewLearning,
  Opportunity, NewOpportunity,
} from "./intelligence.js";
// Competitors + content ideas (0108).
export { competitors, contentIdeas } from "./competitors.js";
export type { Competitor, NewCompetitor, ContentIdea, NewContentIdea } from "./competitors.js";
export { publicDashboards } from "./public_dashboards.js";
export type { PublicDashboard, NewPublicDashboard } from "./public_dashboards.js";
export { adsConnections } from "./ads_connections.js";
export type { AdsConnection, NewAdsConnection } from "./ads_connections.js";
export { adsAccountMappings } from "./ads_account_mappings.js";
export type { AdsAccountMapping, NewAdsAccountMapping } from "./ads_account_mappings.js";
export {
  syncLogs,
  adsCampaigns,
  adsAdsets,
  adsCreatives,
  adsInsights,
  organicPosts,
  organicPostInsights,
  adsAlerts,
} from "./ads_data.js";
export {
  planillaSyncState,
  clientDashboardLinks,
} from "./planilla.js";
export type {
  PlanillaSyncState,
  NewPlanillaSyncState,
  ClientDashboardLink,
  NewClientDashboardLink,
} from "./planilla.js";

// Legacy "meta_*" names — kept as re-exports of the renamed tables so the
// existing routes/services compile while we migrate them. Will be removed
// once the refactor lands.
export { adsConnections as metaConnections } from "./ads_connections.js";
export { adsAccountMappings as metaAdAccountMappings } from "./ads_account_mappings.js";
export {
  syncLogs as metaSyncLogs,
  adsCampaigns as metaCampaigns,
  adsAdsets as metaAdsets,
  adsCreatives as metaAds,
  adsInsights as metaAdsInsights,
  organicPosts as metaPagePosts,
  organicPostInsights as metaPostInsights,
  adsAlerts as metaAlerts,
} from "./ads_data.js";
