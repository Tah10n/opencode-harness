import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function assertIncludes(text, needle, label, code, fix) {
  if (!text.includes(needle)) {
    fail(code, `${label} missing ${needle}`, fix);
  }
}

function unformatCell(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMarkdownRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|") || !line.endsWith("|")) {
      continue;
    }
    const cells = line.slice(1, -1).split("|").map((cell) => unformatCell(cell));
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? match.slice(1).map(Number) : null;
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function releaseMetadataIssues({ packageJson, changelog, compatibility }) {
  const issues = [];
  const currentVersion = packageJson.version;
  const currentSemver = parseSemver(currentVersion);
  if (!currentSemver) {
    issues.push(`package.json version is not strict semver: ${currentVersion ?? "<missing>"}`);
  }
  if (packageJson.engines?.node !== ">=24") {
    issues.push("package.json engines.node must be exactly >=24");
  }
  if (
    packageJson.exports?.["./feedback"] !== "./lib/feedback/index.mjs"
    || packageJson.exports?.["./trace-store"] !== "./lib/feedback/index.mjs"
  ) {
    issues.push("the unreleased package target must expose only the documented feedback entry points");
  }

  const headings = [...changelog.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1]);
  const targetMatch = /^Unreleased \(target: (\d+\.\d+\.\d+)\)$/.exec(headings[0] ?? "");
  if (!targetMatch) {
    issues.push("the first changelog section must be structured as Unreleased (target: X.Y.Z)");
  } else if (targetMatch[1] !== currentVersion) {
    issues.push(`changelog target ${targetMatch[1]} does not match package ${currentVersion}`);
  }

  const releasedHeadings = headings
    .slice(1)
    .map((heading) => /^(\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/.exec(heading))
    .filter(Boolean);
  if (releasedHeadings.length === 0) {
    issues.push("changelog has no dated tagged-release section after Unreleased");
  }
  const latestTaggedVersion = releasedHeadings[0]?.[1];
  const latestTaggedSemver = parseSemver(latestTaggedVersion);
  if (currentSemver && latestTaggedSemver && compareSemver(currentSemver, latestTaggedSemver) <= 0) {
    issues.push(`unreleased package ${currentVersion} must be newer than latest tagged ${latestTaggedVersion}`);
  }
  if (releasedHeadings.some((entry) => entry[1] === currentVersion)) {
    issues.push(`unreleased target ${currentVersion} must not also have a dated release heading`);
  }

  const compatibilityRows = parseMarkdownRows(compatibility).filter(
    (cells) => cells.length === 5 && cells[0] === "opencode-harness",
  );
  const developmentRows = compatibilityRows.filter((cells) => cells[3] === "Unreleased target");
  const taggedRows = compatibilityRows.filter((cells) => cells[3] === "Latest tagged release");
  if (developmentRows.length !== 1) {
    issues.push(`compatibility table must have exactly one Unreleased target row, found ${developmentRows.length}`);
  }
  if (taggedRows.length !== 1) {
    issues.push(`compatibility table must have exactly one Latest tagged release row, found ${taggedRows.length}`);
  }

  const development = developmentRows[0];
  if (development) {
    if (development[1] !== "https://github.com/Tah10n/opencode-harness") {
      issues.push("development compatibility row points at the wrong repository");
    }
    if (development[2] !== currentVersion) {
      issues.push(`development compatibility version ${development[2]} does not match package ${currentVersion}`);
    }
    if (!development[4].includes("feedback APIs")) {
      issues.push("development compatibility role must identify the feedback API surface");
    }
  }

  const tagged = taggedRows[0];
  if (tagged) {
    if (tagged[2] !== `v${latestTaggedVersion}`) {
      issues.push(`tagged compatibility version ${tagged[2]} does not match changelog ${latestTaggedVersion}`);
    }
    if (tagged[1] !== `https://github.com/Tah10n/opencode-harness/tree/v${latestTaggedVersion}`) {
      issues.push("tagged compatibility row must link to the exact release tree");
    }
    if (!tagged[4].includes("no package exports") || !tagged[4].includes("does not expose feedback API subpaths")) {
      issues.push("tagged compatibility role must state that feedback API package exports are absent");
    }
  }

  return issues;
}

const packageJson = JSON.parse(read("package.json"));
const readme = read("README.md");
const compatibility = read("docs/compatibility.md");
const repositories = read("docs/repositories.md");
const evaluation = read("docs/evaluation.md");
const release = read("docs/release.md");
const changelog = read("CHANGELOG.md");
const harnessMap = read("docs/harness-map.md");

for (const issue of releaseMetadataIssues({ packageJson, changelog, compatibility })) {
  fail("HARNESS-D004", issue, "Align the structured package, changelog, and compatibility release states.");
}

const mutationCases = [
  {
    name: "version appears only as an unstructured changelog substring",
    packageJson,
    changelog: changelog.replace(/^## Unreleased \(target: .+\)$/m, `## Unreleased\n\nTarget ${packageJson.version}`),
    compatibility,
  },
  {
    name: "compatibility status is replaced while the old words remain elsewhere",
    packageJson,
    changelog,
    compatibility: `${compatibility.replace("| Unreleased target |", "| Development draft |")}\nUnreleased target`,
  },
  {
    name: "package version is rolled back to the latest tag",
    packageJson: { ...packageJson, version: "0.2.0" },
    changelog,
    compatibility,
  },
];
for (const mutation of mutationCases) {
  if (releaseMetadataIssues(mutation).length === 0) {
    fail("HARNESS-D011", `release metadata parser accepted mutation: ${mutation.name}`, "Keep drift verification structural rather than substring-based.");
  }
}

const currentNodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(currentNodeMajor) || currentNodeMajor < 24) {
  fail("HARNESS-D012", `verification requires Node >=24, current ${process.versions.node}`, "Run the declared package engine and CI version.");
}

const requiredLinks = [
  "https://martinfowler.com/articles/harness-engineering.html",
  "https://github.com/DenisSergeevitch/agents-best-practices",
  "https://github.com/Tah10n/opencode-recursive-context",
  "https://github.com/Tah10n/opencode-learning-guard",
];

for (const link of requiredLinks) {
  assertIncludes(readme, link, "README.md", "HARNESS-D001", "Keep public references current in README.md.");
}

for (const link of requiredLinks.slice(2)) {
  assertIncludes(repositories, link, "docs/repositories.md", "HARNESS-D002", "Keep sibling repository links current.");
  assertIncludes(compatibility, link.split("/").at(-1), "docs/compatibility.md", "HARNESS-D003", "Keep compatibility rows aligned with repository names.");
}

assertIncludes(evaluation, "verify:runtime", "docs/evaluation.md", "HARNESS-D006", "Document the runtime sensor.");
assertIncludes(release, "verify:drift", "docs/release.md", "HARNESS-D007", "Release checks should include drift verification.");
assertIncludes(release, "harness-release-review", "docs/release.md", "HARNESS-D007", "Release checks should include semantic harness review.");
assertIncludes(harnessMap, "Runtime verifier", "docs/harness-map.md", "HARNESS-D008", "Keep the control matrix aligned with available sensors.");
assertIncludes(harnessMap, "Harness release review", "docs/harness-map.md", "HARNESS-D008", "Keep the control matrix aligned with available sensors.");

const placeholderPhrases = [
  "links will be added later",
  "link will be added later",
  "TODO: add repository link",
  "TBD repository",
];

for (const file of ["README.md", "docs/repositories.md", "docs/compatibility.md", "docs/adoption.md"]) {
  const text = read(file).toLowerCase();
  for (const phrase of placeholderPhrases) {
    if (text.includes(phrase.toLowerCase())) {
      fail("HARNESS-D009", `${file} still contains placeholder phrase: ${phrase}`, "Replace placeholder repository notes with current public links.");
    }
  }
}

async function checkLinks() {
  for (const link of requiredLinks) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      let response = await fetch(link, { method: "HEAD", redirect: "follow", signal: controller.signal });
      if (response.status === 405 || response.status === 403) {
        response = await fetch(link, { method: "GET", redirect: "follow", signal: controller.signal });
      }
      if (!response.ok) {
        fail("HARNESS-D010", `${link} returned HTTP ${response.status}`, "Refresh the link or document why it is intentionally unavailable.");
      }
    } catch (error) {
      const fallback = checkWithCurl(link);
      if (!fallback.ok) {
        fail("HARNESS-D010", `${link} check failed: ${error.message}; curl fallback: ${fallback.message}`, "Retry with network access or leave HARNESS_CHECK_LINKS unset for deterministic local checks.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function checkWithCurl(link) {
  const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";
  const result = spawnSync(curlCommand, ["-L", "-I", "--max-time", "30", link], {
    encoding: "utf8",
  });
  if (result.error) {
    return { ok: false, message: result.error.message };
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const statuses = [...output.matchAll(/HTTP\/\S+\s+(\d+)/g)].map((match) => Number(match[1]));
  const finalStatus = statuses.at(-1);
  if (!finalStatus) {
    return { ok: false, message: "no HTTP status in curl output" };
  }
  if (finalStatus >= 200 && finalStatus < 400) {
    return { ok: true, message: `HTTP ${finalStatus}` };
  }
  return { ok: false, message: `HTTP ${finalStatus}` };
}

if (process.env.HARNESS_CHECK_LINKS === "1") {
  await checkLinks();
}

if (failures.length > 0) {
  console.error("Harness drift verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

const linkMode = process.env.HARNESS_CHECK_LINKS === "1" ? "with external link checks" : "without external link checks";
console.log(`Harness drift verification passed (${linkMode}; structured release metadata).`);
