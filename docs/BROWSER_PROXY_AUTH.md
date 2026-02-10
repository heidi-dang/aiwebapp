# Browser Proxy: Authentication & Debugging Guide

The **Browser Proxy** service enables the agent to use a "Free Pro" ChatGPT web account. However, since it simulates a real browser, it occasionally requires manual login (just like your laptop).

## 1. Authentication Status

The proxy automatically detects its login state.

*   **Status: `CONNECTED`**
    *   The browser is logged in and ready.
    *   API requests are served normally.
*   **Status: `NEEDS_AUTH`**
    *   The session has expired or the browser was logged out.
    *   API requests return `503 Service Unavailable`.
    *   **Fallback:** The Runner automatically switches to OpenRouter/Ollama, so the agent keeps working (but might cost money or be less smart).

## 2. How to Re-Authenticate

When the status is `NEEDS_AUTH`, follow these steps to log in manually:

### Method A: VNC Viewer (Recommended)
We expose a VNC port that lets you "see" and control the browser container.

1.  **Connect:** Open your VNC client (e.g., RealVNC, TightVNC).
2.  **Address:** `localhost:5900` (or `your-server-ip:5900`).
3.  **Password:** `secret` (Default, change in `docker-compose.yml` if needed).
4.  **Action:** You will see the Chrome window. Click "Log In", enter your credentials, and solve the captcha.
5.  **Verify:** Once you see the "New Chat" screen, you are done. Disconnect VNC.

### Method B: Debug Screenshot (Quick Check)
If you just want to see *what* is on the screen without controlling it:

1.  **URL:** Open `http://localhost:3003/debug/screenshot` in your browser.
2.  **Action:** This returns a PNG snapshot of the current page. Use it to confirm if you are stuck on a login screen or a captcha.

## 3. Persistent Sessions

To prevent frequent logouts, we use a **Docker Volume** (`browser_data`) to persist the browser's "User Data Directory".

*   **Cookies & LocalStorage:** Saved to disk.
*   **Restart Resilience:** If you restart the container (`docker compose restart browser-proxy`), you stay logged in.
*   **Session Lifetime:** Typically 2-4 weeks, depending on OpenAI's policies.

## 4. Troubleshooting

**Issue: "Browser not logged in" loop**
*   **Fix:** Connect via VNC and refresh the page. Sometimes OpenAI shows a "Verify you are human" button that needs a single click.

**Issue: Proxy failing silently**
*   **Fix:** Check logs: `docker compose logs -f browser-proxy`.
*   **Reset:** If the session is corrupted, delete the volume: `docker volume rm aiwebapp_browser_data`. (Requires re-login).
