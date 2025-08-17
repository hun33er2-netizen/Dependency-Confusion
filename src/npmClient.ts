import axios from "axios";
import pLimit from "p-limit";

export class NpmClient {
  private cache: Map<string, boolean> = new Map();
  private concurrency: number;

  constructor(concurrency = 10) {
    this.concurrency = concurrency;
  }

  private async checkOnce(name: string): Promise<boolean> {
    const encoded = encodeURIComponent(name);
    const url = `https://registry.npmjs.org/${encoded}`;
    try {
      const res = await axios.get(url, { timeout: 5000, validateStatus: () => true });
      if (res.status === 200) {
        return true;
      }
      if (res.status === 404) {
        return false;
      }
      // treat other responses as exists to be conservative
      return true;
    } catch (err) {
      // network problem: return true to avoid false negatives
      return true;
    }
  }

  async exists(name: string): Promise<boolean> {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const limit = pLimit(this.concurrency);
    const val = await limit(() => this.checkOnce(name));
    this.cache.set(name, val);
    return val;
  }
}