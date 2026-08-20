/**
 * LoginState Controller - 用户登录状态管理
 */

import { loginStateService } from '~/electron/service/loginState';
import type { LoginStateInput } from '~/electron/types';

export class LoginStateController {
  login(data: LoginStateInput) {
    return loginStateService.login(data);
  }

  logout(data: { uid: string }) {
    return loginStateService.logout(data.uid);
  }

  getByUid(data: { uid: string }) {
    return loginStateService.getByUid(data.uid);
  }

  getActive() {
    return loginStateService.getActive();
  }

  delete(data: { id: number }) {
    return loginStateService.delete(data.id);
  }

  getAll() {
    return loginStateService.getAll();
  }
}

(LoginStateController as any).toString = () => '[class LoginStateController]';
