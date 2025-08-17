import fs from "fs/promises";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { NpmClient } from "./npmClient";
import chalk from "chalk";
import { extractPackageReferences } from "./utils";

function isExternal(spec: string) {
  if (!spec) return false;
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("http://") || spec.startsWith("https://")) return false;
  return true;
}

async function readFilesList(listFile: string): Promise<string[]> {
  const content = await fs.readFile(listFile, "utf8");
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function scanFilesFromList(listFile: string, opts: { projectRoot?: string; concurrency?: number }) {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const concurrency = opts.concurrency ?? 10;
  const npm = new NpmClient(concurrency);

  const files = await readFilesList(listFile);
  console.log(chalk.gray(`Scanning ${files.length} files...`));

  // Attempt to load project's package.json to know declared dependencies
  const pkgPath = path.join(projectRoot, "package.json");
  let pkg: any = null;
  try {
    const ptxt = await fs.readFile(pkgPath, "utf8");
    pkg = JSON.parse(ptxt);
  } catch (e) {
    // ignore
  }
  const declared = new Set<string>();
  if (pkg) {
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((k) => {
      const o = pkg[k];
      if (o && typeof o === "object") Object.keys(o).forEach((n) => declared.add(n));
    });
  }

  const problems: Array<{ file: string; importSource: string; reason: string }> = [];

  for (const f of files) {
    let content: string;
    try {
      content = await fs.readFile(f, "utf8");
    } catch (e) {
      problems.push({ file: f, importSource: "", reason: "cannot read file" });
      continue;
    }

    // First: parse JS/TS for explicit import/require statements
    let ast: any = null;
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f)) {
      try {
        ast = parse(content, { sourceType: "unambiguous", plugins: ["jsx", "dynamicImport", "classProperties", "optionalChaining"] as any });
      } catch (e) {
        // parse error — we'll still try to extract references from raw text below
        ast = null;
      }
    }

    const imports = new Set<string>();

    if (ast) {
      traverse(ast as any, {
        ImportDeclaration({ node }: any) {
          if (node && node.source && node.source.value) imports.add(node.source.value);
        },
        CallExpression({ node }: any) {
          if (node.callee && node.callee.name === "require" && node.arguments && node.arguments.length === 1) {
            const arg = node.arguments[0];
            if (arg.type === "StringLiteral") imports.add(arg.value);
          }
        },
        ImportExpression({ node }: any) {
          const source = node.source;
          if (source && source.type === "StringLiteral") imports.add(source.value);
        }
      });
    }

    // Second: scan the raw text for references that may appear in README/CI/Dockerfiles or non-parsable files
    const textRefs = extractPackageReferences(content);
    for (const r of textRefs) imports.add(r);

    for (const spec of imports) {
      if (!isExternal(spec)) continue;
      if (!declared.has(spec)) {
        // check if exists on npm
        const exists = await npm.exists(spec);
        const reason = exists ? "external module not declared in package.json and exists on npm (possible confusion target)" : "external module not declared in package.json";
        problems.push({ file: f, importSource: spec, reason });
      } else {
        // declared — but still check if declared name exists on npm too (informational)
        const exists = await npm.exists(spec);
        if (exists) {
          problems.push({ file: f, importSource: spec, reason: "declared in package.json and also exists publicly on npm (informational)" });
        }
      }
    }
  }

  if (problems.length === 0) {
    console.log(chalk.green("No issues found in scanned files."));
  } else {
    console.log(chalk.yellow(`Found ${problems.length} findings:`));
    for (const p of problems) {
      console.log(`- ${p.file}: '${p.importSource}' -> ${p.reason}`);
    }
  }
}