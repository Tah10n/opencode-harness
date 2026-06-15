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

const packageJson = JSON.parse(read("package.json"));
const currentVersion = packageJson.version;
const readme = read("README.md");
const compatibility = read("docs/compatibility.md");
const repositories = read("docs/repositories.md");
const evaluation = read("docs/evaluation.md");
const release = read("docs/release.md");
const changelog = read("CHANGELOG.md");
const harnessMap = read("docs/harness-map.md");

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

assertIncludes(compatibility, `v${currentVersion}`, "docs/compatibility.md", "HARNESS-D004", "Update the compatibility table for the current harness version.");
assertIncludes(changelog, `## ${currentVersion} -`, "CHANGELOG.md", "HARNESS-D005", "Add a dated changelog entry for the current version before release.");
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
console.log(`Harness drift verification passed (${linkMode}).`);
