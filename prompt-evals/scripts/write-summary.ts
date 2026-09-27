import { appendFileSync } from "node:fs";
import { formatDuration, readReport, summarize } from "./parse-report";

function main(): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    console.log("GITHUB_STEP_SUMMARY not set — skipping (not running in GitHub Actions?).");
    return;
  }

  const resultsPath = process.env.RESULTS_JSON_PATH;
  if (!resultsPath) {
    throw new Error("RESULTS_JSON_PATH is not set.");
  }

  const suiteLabel = process.env.SUITE_LABEL ?? "Prompt Eval";
  const report = readReport(resultsPath);

  if (!report) {
    appendFileSync(
      summaryPath,
      `## ❌ ${suiteLabel} Failed to Run\n\nNo results were produced — the run likely crashed before evaluation completed.\n`
    );
    return;
  }

  const { total, passed, failed, failedDescriptions, durationMs } = summarize(report);
  const resultEmoji = failed > 0 ? "❌" : "✅";
  const resultText = failed > 0 ? "Failed" : "Passed";

  let markdown = `## ${resultEmoji} ${suiteLabel} ${resultText}\n\n`;
  markdown += "| Metric | Value |\n|---|---|\n";
  markdown += `| Total | ${total} |\n`;
  markdown += `| Passed | ${passed} |\n`;
  markdown += `| Failed | ${failed} |\n`;
  markdown += `| Duration | ${formatDuration(durationMs)} |\n`;

  if (failedDescriptions.length > 0) {
    markdown += "\n### Failed tests\n\n";
    for (const title of failedDescriptions) {
      markdown += `- ${title}\n`;
    }
  }

  appendFileSync(summaryPath, markdown);
  console.log("Job summary written.");
}

main();
