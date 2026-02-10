# Social Authentication Setup Guide

This guide explains how to obtain Client IDs and Secrets for the supported social login providers (GitHub, Google, Microsoft, Apple) and how to configure them for your tunnel environment.

## General Configuration

- **Server Public URL**: `https://api.yourtunnel.cfargotunnel.com` (replace with your actual tunnel URL)
- **UI Public URL**: `https://app.yourdomain.com` (replace with your actual app URL)

**Important**: All Redirect URIs (Callback URLs) must start with the **Server Public URL**.

**Important**: All Redirect URIs (Callback URLs) must start with the **Server Public URL**.

---

## 1. GitHub OAuth

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Fill in the details:
   - **Application Name**: Heidi AI (or your app name)
   - **Homepage URL**: `https://app.yourdomain.com`
   - **Authorization callback URL**: `https://api.yourtunnel.cfargotunnel.com/auth/oauth/github/callback`
4. Click **Register application**.
5. Copy the **Client ID** and generate a new **Client Secret**.
6. Update `server/.env`:
   ```env
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   ```

---

## 2. Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a project if needed.
3. Go to **Credentials** > **Create Credentials** > **OAuth client ID**.
4. Select **Web application**.
5. Fill in the details:
   - **Name**: Heidi AI
   - **Authorized JavaScript origins**: `https://app.yourdomain.com`
   - **Authorized redirect URIs**: `https://api.yourtunnel.cfargotunnel.com/auth/oauth/google/callback`
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.
8. Update `server/.env`:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

---

## 3. Microsoft OAuth

1. Go to the [Azure Portal > App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Click **New registration**.
3. Fill in the details:
   - **Name**: Heidi AI
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox).
   - **Redirect URI (Web)**: `https://api.87b6e07d-c3f4-48d5-a70c-8379e9a03735.cfargotunnel.com/auth/oauth/microsoft/callback`
4. Click **Register**.
5. Copy the **Application (client) ID**.
6. Go to **Certificates & secrets** > **New client secret**. Create one and copy the **Value** (not the ID).
7. Update `server/.env`:
   ```env
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   ```

---

## 4. Apple OAuth

1. Go to [Apple Developer Account > Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. **App ID**: Create an App ID (e.g., `com.heidi.aiwebapp`) with "Sign In with Apple" enabled.
3. **Service ID**: Create a Service ID (e.g., `com.heidi.aiwebapp.service`).
   - Configure "Sign In with Apple".
   - **Domains and Subdomains**: `app.yourdomain.com` (and `api.yourtunnel.cfargotunnel.com` if required).
   - **Return URLs**: `https://api.yourtunnel.cfargotunnel.com/auth/oauth/apple/callback`
4. **Key**: Create a Key enabled for "Sign In with Apple". Download the `.p8` file.
5. Generate the Client Secret (JWT) using the Key, Team ID, and Service ID (this usually requires a script or tool, as Apple secrets are time-limited JWTs).
6. Update `server/.env`:
   ```env
   APPLE_CLIENT_ID=your_service_id
   APPLE_CLIENT_SECRET=generated_jwt_token
   ```

---

## Final Steps

After updating the `.env` file, restart the server:
```bash
npm run dev
# or in production
npm start
```
