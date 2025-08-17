# depconfuse - Dependency Confusion Scanner

A CLI tool to detect dependency confusion risks in JavaScript/Node projects and to scan JS files for undeclared or potentially dangerous external imports.

Features
- Scans package.json and lock files (package-lock.json / yarn.lock) for declared packages.
- Traverses dependency tree present in lockfiles when available.
- Queries public npm registry to check whether package names are present on npm (possible targets for dependency confusion).
- Scans JavaScript files (list provided in a text file) for import/require statements, flags undeclared imports and imports that exist on the public npm registry (potential confusion targets).
- Supports scanning a GitHub repo (will clone a repository to a temporary folder).

Requirements
- Node 18+ (or a compatible runtime)
- npm
- (Optional) GITHUB_TOKEN environment variable for private repo access

Install
1. npm install
2. npm run build

Usage
- Scan a GitHub repo (public):
  node ./dist/cli.js scan-repo --repo https://github.com/owner/repo.git

- Scan a local project folder:
  node ./dist/cli.js scan-repo --path /path/to/repo

- Scan JS files given in a text file (each line a path):
  node ./dist/cli.js scan-files --list /path/to/file_list.txt --project /path/to/project/root

Options
- --repo : Git clone URL of repository
- --path : Local path to repository
- --list : Path to a newline-delimited text file with JavaScript file paths to scan
- --project : Root of project to use for package.json resolution (defaults to current working dir)
- --concurrency : Number of parallel npm checks (default 10)
- --token : GitHub token (or set GITHUB_TOKEN env var)

Notes
- The scanner performs checks against the public npm registry; false positives are possible (e.g., packages intentionally published to npm). Consider whitelisting known internal packages.
- Improvements: check private registry config (npmrc), examine CI/CD workflows for public publishing steps, automatically compare internal package name patterns.

Examples
- Scan GitHub repo and list suspicious package names:
  node ./dist/cli.js scan-repo --repo https://github.com/owner/repo.git

- Scan specific files listed in files.txt:
  node ./dist/cli.js scan-files --list ./files.txt --project ./myrepo

License
- MIT