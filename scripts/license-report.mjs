#!/usr/bin/env node
// Generates THIRD-PARTY-LICENSES from the current npm workspace and the
// three first-party Go modules (trademark-license-review design.md D2).
// Run via `make license-report`; also run by CI's license-check job to
// diff against the committed file (D3).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// npm workspace members are not third-party — excluded by name, not by
// heuristically parsing `resolved` URLs.
const LOCAL_WORKSPACE_PACKAGES = new Set(["web", "@testpulse/shared"]);

// go-licenses can't detect a license for a package whose directory
// contains only assembly (.s) files — it never walks up to the module's
// actual LICENSE file in that case. Verified manually: each entry below
// has a real LICENSE file at its Go module root.
const GO_LICENSE_OVERRIDES = [
  { prefix: "github.com/segmentio/asm/", license: "MIT" },
];

function npmLicenses() {
  const tree = JSON.parse(
    execFileSync("npm", ["ls", "--all", "--omit=dev", "--json"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 64,
    }),
  );

  const seen = new Map();
  const walk = (node) => {
    for (const [name, info] of Object.entries(node.dependencies ?? {})) {
      // `npm ls --all` lists every dependency edge in the graph, including
      // optional peer dependencies never actually installed on this
      // platform (e.g. esbuild/sass/terser as Vite optional alternatives
      // this project doesn't use) — those have no `version` field and
      // nothing on disk to resolve a license from. Skip them; they are not
      // actually a third-party dependency of this build.
      //
      // Separately, npm's per-OS/arch native-binary optional dependencies
      // (e.g. @rolldown/binding-darwin-arm64 vs. -linux-x64-gnu,
      // lightningcss-*, fsevents) DO have a version and ARE installed, but
      // only the one matching whoever generated the report. They declare
      // `os`/`cpu` restrictions in their own package.json — use that as
      // the generic, forward-compatible signal to exclude them, rather
      // than naming each one, so the report stays identical regardless of
      // which platform `make license-report` runs on.
      if (
        !LOCAL_WORKSPACE_PACKAGES.has(name) &&
        info.version &&
        !isPlatformRestricted(name)
      ) {
        const key = `${name}@${info.version}`;
        if (!seen.has(key)) seen.set(key, { name, version: info.version });
      }
      walk(info);
    }
  };
  walk(tree);

  return [...seen.values()]
    .map(({ name, version }) => ({
      ecosystem: "npm",
      name,
      version,
      license: resolveNpmLicense(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findPackageJson(name) {
  let dir = repoRoot;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, "utf8"));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isPlatformRestricted(name) {
  const pkg = findPackageJson(name);
  if (!pkg) return false;
  // A package restricted to exactly one OS (e.g. fsevents: os:["darwin"])
  // or declaring a `cpu` restriction at all (native binaries always pin
  // to one arch) is a per-platform variant swapped at install time.
  // Packages that merely list several supported platforms (e.g.
  // systeminformation: os:["darwin","linux","win32",...]) are not — they
  // resolve to the same package on every host and must stay in the report.
  if (pkg.cpu && pkg.cpu.length) return true;
  if (pkg.os && pkg.os.length === 1) return true;
  return false;
}

function resolveNpmLicense(name) {
  const pkg = findPackageJson(name);
  return pkg ? formatNpmLicense(pkg.license ?? pkg.licenses) : "UNKNOWN";
}

function formatNpmLicense(license) {
  if (!license) return "UNKNOWN";
  if (typeof license === "string") return license;
  if (Array.isArray(license)) return license.map((l) => l.type ?? String(l)).join(" OR ");
  if (typeof license === "object" && license.type) return license.type;
  return "UNKNOWN";
}

function applyGoOverride(pkg, license) {
  if (license !== "Unknown") return license;
  const override = GO_LICENSE_OVERRIDES.find((o) => pkg.startsWith(o.prefix));
  return override ? override.license : license;
}

function goLicenses(modulePath) {
  let out;
  try {
    out = execFileSync(
      "go",
      [
        "run",
        "github.com/google/go-licenses@v1.6.0",
        "report",
        "./...",
        "--ignore",
        "github.com/Barayo/TestPulse",
      ],
      { cwd: modulePath, encoding: "utf8", maxBuffer: 1024 * 1024 * 16 },
    );
  } catch (err) {
    // go-licenses exits non-zero on any per-package detection failure even
    // though it still prints the CSV report on stdout.
    out = err.stdout ?? "";
  }

  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [pkg, , license] = line.split(",");
      return {
        ecosystem: "go",
        name: pkg,
        version: "",
        license: applyGoOverride(pkg, license ?? "Unknown"),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatSection(title, rows) {
  const lines = [`## ${title}`, ""];
  for (const row of rows) {
    const label = row.version ? `${row.name}@${row.version}` : row.name;
    lines.push(`- ${label}: ${row.license}`);
  }
  return lines.join("\n");
}

const npmRows = npmLicenses();
const apiRows = goLicenses(path.join(repoRoot, "apps/api"));
const importConnectorRows = goLicenses(path.join(repoRoot, "tools/import-connector"));
const jiraConnectorRows = goLicenses(path.join(repoRoot, "tools/jira-connector"));

const header = `# Third-Party Licenses

Generated by \`scripts/license-report.mjs\` (run \`make license-report\` to
regenerate). Lists every third-party dependency's license across the npm
workspace and the three first-party Go modules, per MIT/BSD/Apache-2.0's
copyright-notice-retention requirement (trademark-license-review).
`;

const sections = [
  formatSection(`npm workspace (${npmRows.length} packages)`, npmRows),
  formatSection(`apps/api (${apiRows.length} packages)`, apiRows),
  formatSection(`tools/import-connector (${importConnectorRows.length} packages)`, importConnectorRows),
  formatSection(`tools/jira-connector (${jiraConnectorRows.length} packages)`, jiraConnectorRows),
];

process.stdout.write(`${header}\n${sections.join("\n\n")}\n`);
