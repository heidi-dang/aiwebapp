# Production Environment Setup Checklist

This checklist helps you remember to configure all the necessary environment variables for production deployment.

## Before Running Production Scripts

### 1. Domain Registration & DNS Setup
- [ ] Register your domain (e.g., `yourdomain.com`)
- [ ] Set up DNS records for subdomains:
  - [ ] `yourdomain.com` → Landing page
  - [ ] `app.yourdomain.com` → Main application
  - [ ] `api.yourdomain.com` → API server
  - [ ] `code.yourdomain.com` → Runner service
  - [ ] `auth.yourdomain.com` → Authentication service

### 2. SSL/TLS Certificates
- [ ] Obtain SSL certificates for all subdomains
- [ ] Configure HTTPS for production

### 3. Cloudflare Tunnel (Optional but Recommended)
- [ ] Install Cloudflare CLI (`cloudflared`)
- [ ] Authenticate with Cloudflare: `cloudflared tunnel login`
- [ ] Create tunnel: `cloudflared tunnel create your-tunnel-name`
- [ ] Configure DNS records in Cloudflare dashboard
- [ ] Note your tunnel credentials file path

### 4. OAuth Provider Setup
Configure these in your OAuth provider dashboards with your production URLs:

#### GitHub OAuth
- Homepage URL: `https://app.yourdomain.com`
- Authorization callback URL: `https://api.yourdomain.com/auth/oauth/github/callback`

#### Google OAuth
- Authorized JavaScript origins: `https://app.yourdomain.com`
- Authorized redirect URIs: `https://api.yourdomain.com/auth/oauth/google/callback`

#### Microsoft OAuth
- Redirect URIs: `https://api.yourdomain.com/auth/oauth/microsoft/callback`

#### Apple OAuth
- Domains and Subdomains: `app.yourdomain.com`
- Return URLs: `https://api.yourdomain.com/auth/oauth/apple/callback`

### 5. Environment Variables to Prepare

When the production script prompts you, have these values ready:

```
CORS_ORIGIN=https://app.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_RUNNER_BASE_URL=https://code.yourdomain.com
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_AI_API_URL=https://your-ai-api-endpoint.com
SERVER_PUBLIC_URL=https://api.yourdomain.com
RUNNER_TOKEN=your-secure-runner-token
CLOUDFLARE_TUNNEL_NAME=your-tunnel-name
```

### 6. AI API Configuration
- [ ] Set up your AI API service (OpenAI, Anthropic, etc.)
- [ ] Get API keys and endpoints
- [ ] Test API connectivity

### 7. Database Configuration
- [ ] SQLite is used by default (file-based)
- [ ] Ensure write permissions for database files

### 8. Security Considerations
- [ ] Use strong, unique passwords for all services
- [ ] Enable HTTPS everywhere
- [ ] Configure proper CORS policies
- [ ] Set up monitoring and logging

## Production Deployment Steps

1. Run the production script: `scripts\ops\production-windows.bat`
2. Follow the step-by-step prompts
3. Test all services after deployment
4. Monitor logs for any issues

## Post-Deployment Checklist

- [ ] Landing page loads: `https://yourdomain.com`
- [ ] Main app works: `https://app.yourdomain.com`
- [ ] API responds: `https://api.yourdomain.com/health`
- [ ] Authentication works: `https://auth.yourdomain.com`
- [ ] Runner service accessible: `https://code.yourdomain.com`
- [ ] OAuth login flows work
- [ ] SSL certificates valid
- [ ] All services communicate properly

## Troubleshooting

If something doesn't work:
1. Check the logs in the `logs/` directory
2. Verify environment variables are set correctly
3. Test individual services locally first
4. Check network connectivity and DNS resolution
5. Verify SSL certificates are properly configured

## Important Notes

- Keep your domain and API keys secure
- Regularly update dependencies and certificates
- Monitor service health and performance
- Have backup plans for critical services
- Document any custom configurations you make