import { Page } from 'playwright'

export class ChatGPTClient {
  constructor(private page: Page) {}

  async navigate() {
    // Check if we are already on chatgpt.com
    if (!this.page.url().includes('chatgpt.com')) {
      console.log('[ChatGPT] Navigating to home...')
      await this.page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' })
      // Wait for either login button or prompt area
      await Promise.race([
        this.page.waitForSelector('#prompt-textarea', { timeout: 10000 }),
        this.page.waitForSelector('button[data-testid="login-button"]', { timeout: 10000 })
      ]).catch(() => console.log('[ChatGPT] Navigation wait timeout, checking state...'))
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      // Check for the prompt textarea which indicates we are logged in
      await this.page.waitForSelector('#prompt-textarea', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  async sendMessage(text: string, model = 'gpt-4') {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in. Please log in manually via VNC.')
    }

    // Ensure we are in a new chat or clear state?
    // For simplicity, we just type into the box. 
    // Ideally we might want to click "New Chat" for a fresh context.
    // await this.page.click('a[href="/"]') // Click New Chat

    const textarea = await this.page.waitForSelector('#prompt-textarea')
    if (!textarea) throw new Error('Input box not found')

    // Simulate human typing
    await textarea.click()
    await this.page.keyboard.type(text, { delay: 10 }) // Fast typing but distinct events

    // Click send
    const sendButton = await this.page.waitForSelector('button[data-testid="send-button"]')
    if (sendButton) {
      await sendButton.click()
    } else {
      await this.page.keyboard.press('Enter')
    }

    // Return a stream/iterator? 
    // For now, let's just wait for the response to start
    console.log('[ChatGPT] Message sent')
  }

  async *streamResponse() {
    // Watch for the last message bubble
    // This logic is tricky because DOM changes.
    // We look for the "streaming" class or the last "assistant" message.
    
    // Simple heuristic: Wait for the "Stop generating" button to appear, then disappear.
    // Or observe the last `.markdown` element for text changes.

    let lastText = ''
    let isComplete = false
    const timeout = 60000 // 60s timeout
    const startTime = Date.now()

    while (!isComplete) {
      if (Date.now() - startTime > timeout) throw new Error('Timeout waiting for response')

      // Get the last assistant message
      // Selector depends on current ChatGPT DOM. 
      // Often: article[data-testid^="conversation-turn"]
      const messages = await this.page.$$('div[data-message-author-role="assistant"]')
      const lastMessage = messages[messages.length - 1]

      if (lastMessage) {
        const text = await lastMessage.innerText()
        if (text.length > lastText.length) {
          const chunk = text.slice(lastText.length)
          yield chunk
          lastText = text
        }
      }

      // Check if generation is done
      // The send button usually returns when done, or "Stop generating" disappears
      const sendButton = await this.page.$('button[data-testid="send-button"]')
      if (sendButton && lastText.length > 0) {
        isComplete = true
      }

      await this.page.waitForTimeout(100)
    }
  }
}
