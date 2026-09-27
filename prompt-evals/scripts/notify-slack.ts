import { formatDuration, summarizeAll, type SuiteSummary } from "./parse-report";

async function postToSlack(webhookUrl: string, blocks: Record<string, unknown>[]): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook responded with ${response.status}: ${await response.text()}`);
  }

  console.log("Slack notification sent.");
}

function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function buildTable(suites: SuiteSummary[]): string {
  const labelWidth = Math.max(5, ...suites.map((s) => s.label.length));
  const header = `${padEnd("Suite", labelWidth)}  Pass  Fail`;
  const rows = suites.map((s) => {
    const pass = s.crashed ? "-" : String(s.passed);
    const fail = s.crashed ? "-" : String(s.failed);
    const note = s.crashed ? "  (crashed — no results produced)" : "";
    return `${padEnd(s.label, labelWidth)}  ${padEnd(pass, 4)}  ${padEnd(fail, 4)}${note}`;
  });
  return ["```", header, ...rows, "```"].join("\n");
}

async function main(): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("SLACK_WEBHOOK_URL not set — skipping Slack notification.");
    return;
  }

  const resultsPaths = (process.env.RESULTS_JSON_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (resultsPaths.length === 0) {
    throw new Error("RESULTS_JSON_PATHS is not set (comma-separated list of -o result files).");
  }

  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const branch = process.env.GITHUB_REF_NAME ?? "unknown";
  const commit = (process.env.GITHUB_SHA ?? "unknown").slice(0, 7);
  const actor = process.env.GITHUB_ACTOR ?? "unknown";
  const event = process.env.GITHUB_EVENT_NAME ?? "unknown";

  const suites = summarizeAll(resultsPaths);
  const anyFailedOrCrashed = suites.some((s) => s.crashed || s.failed > 0);
  const totalPassed = suites.reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = suites.reduce((sum, s) => sum + s.failed, 0);
  const totalDurationMs = suites.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

  const resultEmoji = anyFailedOrCrashed ? "❌" : "✅";
  const resultText = anyFailedOrCrashed ? "Suites Failed" : "All Suites Passed";

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${resultEmoji} ${resultText}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: buildTable(suites) },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Summary:*" },
      fields: [
        { type: "mrkdwn", text: `*Total Passed:*\n${totalPassed}` },
        { type: "mrkdwn", text: `*Total Failed:*\n${totalFailed}` },
        { type: "mrkdwn", text: `*Duration:*\n${formatDuration(totalDurationMs)}` },
        { type: "mrkdwn", text: `*Branch:*\n${branch}` },
        { type: "mrkdwn", text: `*Commit:*\n${commit}` },
        { type: "mrkdwn", text: `*Triggered by:*\n${actor} (${event})` },
      ],
    },
  ];

  for (const suite of suites) {
    if (suite.failedDescriptions.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${suite.label} — failed tests:*\n${suite.failedDescriptions.map((title) => `• ${title}`).join("\n")}`,
        },
      });
    }
  }

  const artifactUrl = process.env.ARTIFACT_URL;
  const linksText = artifactUrl
    ? `<${runUrl}|View full run in GitHub Actions> · <${artifactUrl}|Download full interactive reports>`
    : `<${runUrl}|View full run in GitHub Actions> — full interactive per-suite reports are downloadable from that run's Artifacts section`;

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: linksText }],
  });

  await postToSlack(webhookUrl, blocks);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
