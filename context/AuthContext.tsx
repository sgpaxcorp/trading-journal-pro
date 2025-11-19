"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { AppUser, PlanId } from "@/lib/types";
import {
  getStoredUser,
  signUpLocal,
  signInLocal,
  signOutLocal,
} from "@/lib/auth-local";
import {
  sendWelcomeEmail,
  sendSubscriptionReceiptEmail,
} from "@/lib/email";

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  signUp: (args: {
    name: string;
    email: string;
    password: string;
    plan: PlanId;
  }) => Promise<void>;
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getStoredUser();
    if (u) setUser(u);
    setLoading(false);
  }, []);

  const signUp = async ({ name, email, password, plan }: {
    name: string;
    email: string;
    password: string;
    plan: PlanId;
  }) => {
    const newUser = await signUpLocal({ name, email, password, plan });
    setUser(newUser);

    // En producción esto pueden ser tareas async desacopladas
    await sendWelcomeEmail(newUser);
    await sendSubscriptionReceiptEmail(newUser, plan);
  };

  const signIn = async ({ email, password }: {
    email: string;
    password: string;
  }) => {
    const u = await signInLocal({ email, password });
    setUser(u);
  };

  const signOut = async () => {
    await signOutLocal();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
