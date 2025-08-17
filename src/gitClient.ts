import simpleGit, { SimpleGit } from "simple-git";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export async function cloneRepoToTemp(urlOrPath: string, token?: string): Promise<string> {
  // If it's a local path, return it
  if (!/^https?:\/\/.test(urlOrPath) && !urlOrPath.endsWith(".git")) {
    // assume local path
    return urlOrPath;
  }

  // Use a temp dir and clone
  const tmp = path.join(os.tmpdir(), `depconfuse-${uuidv4()}`);
  await fs.mkdir(tmp, { recursive: true });

  const git: SimpleGit = simpleGit();

  const cloneUrl = token ? urlOrPath.replace("https://", `https://${token}@`) : urlOrPath;

  await git.clone(cloneUrl, tmp, { "--depth": "1" } as any);
  return tmp;
}