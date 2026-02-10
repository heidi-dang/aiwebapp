export class AuthService {
  constructor(apiKey: string) {}

  async authenticate(apiKey: string): Promise<boolean> {
    return true;
  }

  async validateToken(token: string): Promise<{ userId?: string } | null> {
    return { userId: 'user' };
  }

  dispose() {}
}