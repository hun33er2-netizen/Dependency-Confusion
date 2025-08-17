#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { scanRepo } from "./scanner";
import { scanFilesFromList } from "./fileScanner";

const program = new Command();

program
  .name("depconfuse")
  .description("Dependency confusion scanner for repos and JS files")
  .version("0.1.0");

program
  .command("scan-repo")
  .description("Clone/scan a repository")
  .option("--repo <url>", "git clone URL")
  .option("--path <localPath>", "local repository path")
  .option("--concurrency <n>", "concurrency for npm checks", "10")
  .action(async (opts) => {
    const concurrency = parseInt(opts.concurrency, 10) || 10;
    const repoOrPath = opts.repo ?? opts.path;
    if (!repoOrPath) {
      console.error("Provide --repo or --path");
      process.exit(2);
    }
    await scanRepo({ repoOrPath, concurrency });
  });

program
  .command("scan-files")
  .description("Scan list of JS files for imports/requires")
  .requiredOption("--list <file>", "path to newline-delimited list of files")
  .option("--project <root>", "project root for resolving package.json", process.cwd())
  .option("--concurrency <n>", "concurrency for npm checks", "10")
  .action(async (opts) => {
    const concurrency = parseInt(opts.concurrency, 10) || 10;
    const listPath = path.resolve(opts.list);
    const projectRoot = path.resolve(opts.project || process.cwd());
    await scanFilesFromList(listPath, { projectRoot, concurrency });
  });

program.parseAsync(process.argv);