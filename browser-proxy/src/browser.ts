import { chromium, BrowserContext, Page } from 'playwright'
// @ts-ignore - types missing for this plugin
import stealthPlugin from 'puppeteer-extra-plugin-stealth'

export class BrowserManager {
  private context: BrowserContext | null = null
  private page: Page | null = null
  private userDataDir: string

  constructor(userDataDir = '/app/user_data') {
    this.userDataDir = userDataDir
  }

  async init() {
    console.log('[BrowserManager] Initializing with user data dir:', this.userDataDir)
    
    // Launch persistent context
    // We use chromium but can switch to firefox/webkit if needed
    // In Docker, we usually run headless=true. 
    // For debugging locally, we might want headless=false.
    const headless = process.env.HEADLESS !== 'false'

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    // Create a new page or get existing one
    const pages = this.context.pages()
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage()
    
    // Stealth mode: Although playwright-extra exists, standard stealth args often work well enough
    // for basic persistence. We can enhance this later with specific plugins if detection occurs.
    
    console.log('[BrowserManager] Browser launched successfully')
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      await this.init()
    }
    return this.page!
  }

  async close() {
    if (this.context) {
      await this.context.close()
      this.context = null
      this.page = null
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.page) return false
      // Simple check to see if browser is responsive
      await this.page.evaluate(() => 1 + 1)
      return true
    } catch (err) {
      return false
    }
  }
}

export const browserManager = new BrowserManager()
