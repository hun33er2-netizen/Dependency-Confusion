export function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/**
 * Extract likely package names from arbitrary text content.
 * This looks for several common contexts where a package name might appear:
 * - require('pkg'), import ... from 'pkg', dynamic import('pkg')
 * - npm/yarn/pnpm install/add commands
 * - inline code ticks like `pkg-name` or `@org/pkg`
 *
 * It returns a Set of candidate package specifiers (as found).
 */
export function extractPackageReferences(content: string): Set<string> {
  const out = new Set<string>();
  if (!content) return out;

  // Helper to test if a string looks like a package specifier
  const isLikelyPackage = (s: string) => {
    if (!s || typeof s !== "string") return false;
    // Exclude paths or urls
    if (s.startsWith(".") || s.startsWith("/") || s.startsWith("http://") || s.startsWith("https://")) return false;
    // Typical package name or scoped package: @scope/name or name or name/subpath
    // Allow dots, hyphens, underscores
    return /^@?[\w\-.]+(\/[\w\-.]+)?$/.test(s);
  };

  // Patterns to capture package-like tokens
  const patterns: RegExp[] = [
    // require('pkg') or require("pkg")
    /require\s*\(\s*['"]([^'\"]+)['"]\s*\)/g,
    // import ... from 'pkg'
    /from\s+['"]([^'\"]+)['"]/g,
    // dynamic import('pkg')
    /import\s*\(\s*['"]([^'\"]+)['"]\s*\)/g,
    // import 'pkg';
    /import\s+['"]([^'\"]+)['"]/g,
    // npm install or npm i [--flags] pkg1 pkg2
    /npm\s+(?:install|i)(?:[^
\r]*)\s+([@A-Za-z0-9_\-./]+)(?=(?:\s|$))/g,
    // yarn add pkg
    /yarn\s+add(?:[^
\r]*)\s+([@A-Za-z0-9_\-./]+)(?=(?:\s|$))/g,
    // pnpm add pkg
    /pnpm\s+add(?:[^
\r]*)\s+([@A-Za-z0-9_\-./]+)(?=(?:\s|$))/g,
    // inline code ticks `pkg-name` or `@org/pkg`
    /`(@?[A-Za-z0-9_\-./]+)`/g,
    // Markdown fenced code blocks may contain install commands; catch common `npm i pkg` forms
    /(?:npm|yarn|pnpm)\s+(?:install|i|add)(?:[^
\r]*?)([@A-Za-z0-9_\-./]+)(?=(?:\s|$))/g
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    // Reset lastIndex in case the regex is global (it is)
    re.lastIndex = 0;
    while ((m = re.exec(content))) {
      const candidate = m[1];
      if (candidate && isLikelyPackage(candidate)) out.add(candidate);
      // For npm install with multiple packages, try to capture following tokens on the same command line
      if (re === patterns[4] || re === patterns[7]) {
        // Look ahead on same line for additional tokens
        const line = content.slice(m.index, content.indexOf("\n", m.index) === -1 ? content.length : content.indexOf("\n", m.index));
        const extras = line
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(1); // skip the command token
        for (const tok of extras) {
          // stop at option-like tokens
          if (tok.startsWith("-")) continue;
          if (isLikelyPackage(tok)) out.add(tok);
        }
      }
    }
  }

  return out;
}