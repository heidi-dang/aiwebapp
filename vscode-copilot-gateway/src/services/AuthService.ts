import * as vscode from 'vscode';
import axios from 'axios';
import { AuthToken } from '../types';

export class AuthService {
  private authServiceUrl: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.auth');
    this.authServiceUrl = config.get('serviceUrl', 'http://localhost:4003');
  }

  async validateToken(token: string): Promise<AuthToken> {
    try {
      const response = await axios.post(`${this.authServiceUrl}/auth/validate`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      if (response.data && response.data.valid) {
        return {
          user_id: response.data.user_id,
          session_id: response.data.session_id || '',
          permissions: response.data.permissions || [],
          expires_at: response.data.expires_at || 0
        };
      } else {
        throw new Error('Invalid token');
      }
    } catch (error) {
      console.error('Auth service validation error:', error);
      throw new Error('Authentication failed');
    }
  }

  async getUserProfile(userId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.authServiceUrl}/auth/profile/${userId}`, {
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get user profile:', error);
      return null;
    }
  }

  async checkPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(userId);
      return profile && profile.permissions && profile.permissions.includes(permission);
    } catch (error) {
      console.error('Failed to check permission:', error);
      return false;
    }
  }

  dispose(): void {
    // Clean up any resources if needed
  }
}
