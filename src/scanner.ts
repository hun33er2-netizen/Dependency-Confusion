import fs from "fs/promises";
import path from "path";
import { cloneRepoToTemp } from "./gitClient";
import { NpmClient } from "./npmClient";
import ora from "ora";
import chalk from "chalk";
import globby from "globby";
import { extractPackageReferences, uniq } from "./utils";

type ScanRepoOpts = {
  repoOrPath: string;
  concurrency?: number;
};

function loadJSONSafe(filePath: string) {
  return fs.readFile(filePath, "utf8").then((s) => JSON.parse(s)).catch(() => null);
}

function collectDeps(pkgJson: any): string[] {
  const out = new Set<string>();
  if (!pkgJson) return [];
  ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((k) => {
    const o = pkgJson[k];
    if (o && typeof o === "object") {
      Object.keys(o).forEach((name) => out.add(name));
    }
  });
  return Array.from(out);
}

function isExternal(spec: string) {
  if (!spec) return false;
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("http://") || spec.startsWith("https://")) return false;
  return true;
}

/**
 * Files/globs to scan for dependency references beyond package.json:
 * - README.md and other markdown docs
 * - docs/**/*.md
 * - .github/workflows/**/*.yml (CI workflows often show install commands)
 * - Dockerfiles and docker-compose files
 * - shell scripts and other plain-text files
 */
const DEFAULT_SCAN_GLOBS = [
  "README.md",
  "**/*.md",
  "docs/**/*.md",
  ".github/workflows/**/*.{yml,yaml}",
  "Dockerfile",
  "**/Dockerfile*",
  "**/*.sh",
  "**/*.bash",
  "**/*.yml",
  "**/*.yaml"
];

export async function scanRepo(opts: ScanRepoOpts) {
  const spinner = ora("Preparing scan").start();
  const token = process.env.GITHUB_TOKEN;
  const folder = await cloneRepoToTemp(opts.repoOrPath, token);
  spinner.succeed(`Repo available at ${folder}`);

  const pkgPath = path.join(folder, "package.json");
  const pkg = await loadJSONSafe(pkgPath);
  const lock = await loadJSONSafe(path.join(folder, "package-lock.json"));
  const yarnLock = await fs.readFile(path.join(folder, "yarn.lock"), "utf8").catch(() => null);

  const declared = collectDeps(pkg);
  const declaredSet = new Set(declared);
  const npm = new NpmClient(opts.concurrency ?? 10);

  spinner.start(`Checking ${declared.length} declared packages on npm`);
  const results: Array<{ name: string; existsOnNpm: boolean }> = [];
  for (const name of declared) {
    const exists = await npm.exists(name);
    results.push({ name, existsOnNpm: exists });
  }
  spinner.succeed("Declared-package check complete");

  // Report suspicious ones: declared in package.json AND also present on npm
  const suspicious = results.filter((r) => r.existsOnNpm);
  if (suspicious.length === 0) {
    console.log(chalk.green("No declared packages were found on public npm (no obvious dependency confusion candidates)."));
  } else {
    console.log(chalk.yellow(`Found ${suspicious.length} declared package names that also exist on public npm:`));
    suspicious.forEach((s) => {
      console.log(` - ${s.name}`);
    });
  }

  // Scan additional files for references
  spinner.start("Searching repository files for package references (README, docs, workflows, Dockerfiles, scripts...)");
  const patterns = DEFAULT_SCAN_GLOBS;
  let paths: string[] = [];
  try {
    paths = await globby(patterns, { cwd: folder, gitignore: true, absolute: true });
  } catch (e) {
    // fallback: no extra files
    paths = [];
  }
  spinner.succeed(`Found ${paths.length} candidate files to scan`);

  const referenced = new Set<string>();
  for (const p of paths) {
    let content: string;
    try {
      content = await fs.readFile(p, "utf8");
    } catch (e) {
      continue;
    }
    const refs = extractPackageReferences(content);
    for (const r of refs) {
      if (isExternal(r)) referenced.add(r);
    }
  }

  const referencedList = uniq(Array.from(referenced)).sort();
  if (referencedList.length === 0) {
    console.log(chalk.green("No package references found in README/docs/workflows/dockerfiles."));
  } else {
    console.log(chalk.yellow(`Found ${referencedList.length} distinct package references in documentation/CI/Dockerfiles:`));
    for (const name of referencedList) {
      const declaredFlag = declaredSet.has(name) ? "(declared)" : "(not declared)";
      const exists = await npm.exists(name);
      const existsFlag = exists ? "exists on npm" : "does NOT exist on npm";
      console.log(` - ${name} ${declaredFlag} — ${existsFlag}`);
    }
  }

  // Extra heuristics
  if (pkg && pkg.private === true) {
    console.log(chalk.blue("Project marked as private in package.json — still check for internal package names being published publicly"));
  }

  if (lock) {
    console.log(chalk.gray("package-lock.json detected — consider analyzing nested dependencies (not fully expanded in this scan)."));
  } else if (yarnLock) {
    console.log(chalk.gray("yarn.lock detected — consider analyzing nested dependencies."));
  } else {
    console.log(chalk.gray("No lockfile detected — nested dependencies cannot be enumerated reliably."));
  }

  console.log(chalk.green("Scan complete."));
}