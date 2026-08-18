import { create } from "zustand";
import { authApi, clearTokens, getAccessToken, setTokens } from "../api/client";
import type { User } from "../api/types";

type AuthState = {
  user: User | null;
  ready: boolean;
  load: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, invite?: string) => Promise<void>;
  logout: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  load: async () => {
    if (!getAccessToken()) {
      set({ user: null, ready: true });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, ready: true });
    } catch {
      clearTokens();
      set({ user: null, ready: true });
    }
  },
  login: async (username, password) => {
    const tokens = await authApi.login({ username, password });
    setTokens(tokens);
    const user = await authApi.me();
    set({ user });
  },
  register: async (username, password, invite) => {
    const tokens = await authApi.register({
      username,
      password,
      invite_code: invite || undefined,
    });
    setTokens(tokens);
    const user = await authApi.me();
    set({ user });
  },
  logout: () => {
    clearTokens();
    set({ user: null });
  },
}));
