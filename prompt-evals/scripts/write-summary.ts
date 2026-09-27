import { appendFileSync } from "node:fs";
import { formatDuration, summarizeAll } from "./parse-report";

function main(): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    console.log("GITHUB_STEP_SUMMARY not set — skipping (not running in GitHub Actions?).");
    return;
  }

  const resultsPaths = (process.env.RESULTS_JSON_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (resultsPaths.length === 0) {
    throw new Error("RESULTS_JSON_PATHS is not set (comma-separated list of -o result files).");
  }

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
  const resultText = anyFailedOrCrashed ? "Some Suites Failed" : "All Suites Passed";

  let markdown = `## ${resultEmoji} ${resultText}\n\n`;
  markdown += "| Suite | Pass | Fail |\n|---|---|---|\n";
  for (const suite of suites) {
    const pass = suite.crashed ? "-" : String(suite.passed);
    const fail = suite.crashed ? "-" : String(suite.failed);
    const note = suite.crashed ? " *(crashed — no results produced)*" : "";
    markdown += `| ${suite.label}${note} | ${pass} | ${fail} |\n`;
  }

  markdown += "\n### Summary\n\n";
  markdown += "| Metric | Value |\n|---|---|\n";
  markdown += `| Total Passed | ${totalPassed} |\n`;
  markdown += `| Total Failed | ${totalFailed} |\n`;
  markdown += `| Duration | ${formatDuration(totalDurationMs)} |\n`;
  markdown += `| Branch | ${branch} |\n`;
  markdown += `| Commit | ${commit} |\n`;
  markdown += `| Triggered by | ${actor} (${event}) |\n`;

  for (const suite of suites) {
    if (suite.failedDescriptions.length > 0) {
      markdown += `\n### ${suite.label} — failed tests\n\n`;
      for (const title of suite.failedDescriptions) {
        markdown += `- ${title}\n`;
      }
    }
  }

  const artifactUrl = process.env.ARTIFACT_URL;
  markdown += artifactUrl
    ? `\n[Download full interactive reports](${artifactUrl}) (prompts, responses, per-assertion detail).\n`
    : "\n_Full interactive per-suite reports (prompts, responses, per-assertion detail) are attached to this run as a downloadable Artifact, further down this page._\n";

  appendFileSync(summaryPath, markdown);
  console.log("Job summary written.");
}

main();
