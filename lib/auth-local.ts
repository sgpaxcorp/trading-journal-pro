// lib/auth-local.ts
import { AppUser, PlanId } from "./types";

const STORAGE_KEY = "tjp_current_user";

function generateId() {
  return `user_${Math.random().toString(36).slice(2, 10)}`;
}

export function getStoredUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function storeUser(user: AppUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

type SignUpArgs = {
  name: string;
  email: string;
  password: string;
  plan: PlanId;
};

export async function signUpLocal(args: SignUpArgs): Promise<AppUser> {
  // FUTURO:
  // - validar email único
  // - hashear contraseña
  // - guardar en DB real
  const user: AppUser = {
    id: generateId(),
    name: args.name,
    email: args.email,
    plan: args.plan,
    createdAt: new Date().toISOString(),
  };

  storeUser(user);
  return user;
}

type SignInArgs = {
  email: string;
  password: string;
};

export async function signInLocal(args: SignInArgs): Promise<AppUser> {
  // MOCK: solo valida contra el usuario guardado en localStorage
  const existing = getStoredUser();
  if (!existing || existing.email !== args.email) {
    throw new Error("Invalid credentials.");
  }
  // Password ignorado por ahora (en real se valida con hash)
  return existing;
}

export async function signOutLocal(): Promise<void> {
  clearUser();
}
