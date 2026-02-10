import { AuthToken } from '../types';
export declare class AuthService {
    private authServiceUrl;
    constructor();
    validateToken(token: string): Promise<AuthToken>;
    getUserProfile(userId: string): Promise<any>;
    checkPermission(userId: string, permission: string): Promise<boolean>;
    dispose(): void;
}
//# sourceMappingURL=AuthService.d.ts.map