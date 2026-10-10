window.APP_CONFIG = {
  pageSize: 200,
  tickerIntervalMs: 500,
  tickerVisibleRows: 20,
  storageKey: 'activity:viewed',
};

window.AGENTS = [
  { name: 'billing-assistant', owner: 'Finance Platform', description: 'Answers invoice questions and issues refunds under a configured limit.' },
  { name: 'support-triage', owner: 'Customer Success', description: 'Classifies inbound tickets, drafts first responses and routes escalations to the right queue.' },
  { name: 'code-reviewer', owner: 'Developer Experience', description: 'Reviews pull requests for style and obvious defects.' },
  { name: 'sales-researcher', owner: 'Revenue Ops', description: 'Builds account briefs from CRM history, public filings and recent news before discovery calls, and keeps them current as deals progress.' },
  { name: 'hr-onboarding', owner: 'People Team', description: 'Walks new hires through paperwork and provisioning.' },
  { name: 'incident-scribe', owner: 'SRE', description: 'Joins incident channels, keeps a timeline and drafts the postmortem skeleton.' },
  { name: 'data-analyst', owner: 'Analytics', description: 'Writes and runs read-only SQL against the warehouse to answer ad-hoc business questions.' },
  { name: 'contract-summariser', owner: 'Legal', description: 'Summarises vendor contracts and flags non-standard clauses.' },
  { name: 'qa-runner', owner: 'Quality', description: 'Runs regression suites on staging and files bugs with reproduction steps, screenshots and logs attached.' },
  { name: 'docs-writer', owner: 'Developer Experience', description: 'Keeps API reference pages in sync with the OpenAPI spec.' },
  { name: 'procurement-bot', owner: 'Operations', description: 'Collects quotes and prepares purchase orders for approval.' },
  { name: 'security-advisor', owner: 'Security', description: 'Answers policy questions and checks configuration drift against the baseline, opening tickets when a control is out of compliance.' },
  { name: 'marketing-copy', owner: 'Growth', description: 'Drafts campaign copy variants.' },
  { name: 'travel-booker', owner: 'Workplace', description: 'Books travel within policy and keeps itineraries updated when plans change.' },
  { name: 'release-manager', owner: 'Platform', description: 'Coordinates release trains, collects sign-offs and publishes changelogs.' },
  { name: 'it-helpdesk', owner: 'IT', description: 'Resets passwords, unlocks accounts and answers device questions.' },
  { name: 'pricing-advisor', owner: 'Revenue Ops', description: 'Suggests discount bands from deal size, segment and historical win rates, and explains the reasoning to the account owner.' },
  { name: 'translation-agent', owner: 'Localisation', description: 'Translates UI strings and help articles.' },
  { name: 'compliance-checker', owner: 'Legal', description: 'Checks outbound messages against regulatory wording rules.' },
  { name: 'capacity-planner', owner: 'SRE', description: 'Forecasts cluster capacity from usage trends and proposes node pool changes ahead of seasonal peaks.' },
  { name: 'research-digest', owner: 'Product', description: 'Summarises interview notes into weekly themes.' },
  { name: 'expense-auditor', owner: 'Finance Platform', description: 'Reviews expense reports for policy violations and duplicate receipts.' },
  { name: 'calendar-assistant', owner: 'Workplace', description: 'Finds meeting slots across time zones.' },
  { name: 'churn-predictor', owner: 'Customer Success', description: 'Scores accounts for churn risk every night and explains the top contributing signals for each at-risk account.' },
];

window.TOOLS = ['http.request', 'sql.query', 'fs.read', 'fs.write', 'email.send', 'slack.post', 'jira.create', 'github.comment', 'shell.exec', 'calendar.create'];
window.USERS = ['priya.sharma@acme.io', 'jonas.weber@acme.io', 'maria.lopez@acme.io', 'kenji.tanaka@acme.io', 'amara.okafor@acme.io', 'liam.oconnor@acme.io'];
window.WORKSPACES = ['acme-production', 'acme-staging', 'acme-finance-eu', 'acme-support-us', 'acme-research-sandbox'];
window.CHANNELS = ['the web console', 'the Slack integration', 'a scheduled workflow', 'the public API', 'an IDE extension'];
window.STATUSES =['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'blocked', 'error'];

window.ACTIVITY = (function buildActivity(count) {
  let seed = 20261009;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const start = Date.UTC(2026, 9, 9, 0, 0, 0);
  const events = [];
  for (let i = 0; i < count; i++) {
    const agent = pick(window.AGENTS).name;
    const tool = pick(window.TOOLS);
    events.push({
      id: 'evt_' + (100000 + i).toString(36) + Math.floor(random() * 1e6).toString(36),
      timestamp: new Date(start + Math.floor(random() * 86400000)).toISOString(),
      agent,
      tool,
      status: pick(window.STATUSES),
      latencyMs: Math.floor(20 + random() * random() * 3000),
      summary: tool + ' called by ' + agent + ' for request #' + Math.floor(random() * 90000 + 10000) +
        ' on behalf of ' + pick(window.USERS) + ' in workspace ' + pick(window.WORKSPACES) + ' via ' + pick(window.CHANNELS),
    });
  }
  return events;
})(100000);
