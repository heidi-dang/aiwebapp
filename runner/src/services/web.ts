
export class WebService {
  async fetchPage(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
      const html = await res.text();
      // Simple tag stripping to extract text
      // Remove scripts and styles first
      const noScript = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                           .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
      const text = noScript.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text.slice(0, 5000); // Limit length
    } catch (err: any) {
      return `Error fetching ${url}: ${err.message}`;
    }
  }
}
