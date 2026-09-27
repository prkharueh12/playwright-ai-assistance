import { formatDuration, readReport, summarize } from "./parse-report";

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

async function main(): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("SLACK_WEBHOOK_URL not set — skipping Slack notification.");
    return;
  }

  const resultsPath = process.env.RESULTS_JSON_PATH;
  if (!resultsPath) {
    throw new Error("RESULTS_JSON_PATH is not set.");
  }

  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const branch = process.env.GITHUB_REF_NAME ?? "unknown";
  const commit = (process.env.GITHUB_SHA ?? "unknown").slice(0, 7);
  const actor = process.env.GITHUB_ACTOR ?? "unknown";
  const event = process.env.GITHUB_EVENT_NAME ?? "unknown";
  const suiteLabel = process.env.SUITE_LABEL ?? "Prompt Eval";

  const report = readReport(resultsPath);
  if (!report) {
    // No report file means the run crashed before promptfoo produced any
    // results (e.g. a missing secret the built-in provider validates
    // upfront, or a config error) — still alert, just without stats.
    await postToSlack(webhookUrl, [
      {
        type: "header",
        text: { type: "plain_text", text: `❌ ${suiteLabel} Failed to Run` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `No results were produced — the run likely crashed before evaluation completed (e.g. a missing API key or config error).\n*Branch:* ${branch}\n*Commit:* ${commit}\n*Triggered by:* ${actor} (${event})`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${runUrl}|View full run in GitHub Actions>` }],
      },
    ]);
    return;
  }

  const { total, passed, failed, failedDescriptions, durationMs } = summarize(report);
  const resultEmoji = failed > 0 ? "❌" : "✅";
  const resultText = failed > 0 ? "Failed" : "Passed";

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${resultEmoji} ${suiteLabel} ${resultText}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total:*\n${total}` },
        { type: "mrkdwn", text: `*Passed:*\n${passed}` },
        { type: "mrkdwn", text: `*Failed:*\n${failed}` },
        { type: "mrkdwn", text: `*Duration:*\n${formatDuration(durationMs)}` },
        { type: "mrkdwn", text: `*Branch:*\n${branch}` },
        { type: "mrkdwn", text: `*Commit:*\n${commit}` },
        { type: "mrkdwn", text: `*Triggered by:*\n${actor} (${event})` },
      ],
    },
  ];

  if (failedDescriptions.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Failed tests:*\n${failedDescriptions.map((title) => `• ${title}`).join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${runUrl}|View full run in GitHub Actions>` }],
  });

  await postToSlack(webhookUrl, blocks);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
