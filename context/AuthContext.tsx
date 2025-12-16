"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  User as SupabaseUser,
  Session,
  AuthChangeEvent,
} from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { AppUser, PlanId } from "@/lib/types";
import {
  sendWelcomeEmail,
  sendSubscriptionReceiptEmail,
} from "@/lib/email";

/* ========================
   Tipos
======================== */

type SignUpArgs = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  address: string; // dirección postal
  plan: PlanId; // core | advanced
};

type SignInArgs = {
  email: string;
  password: string;
};

type SignUpResult = {
  userId: string;
  email: string;
  plan: PlanId;
};

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  signUp: (args: SignUpArgs) => Promise<SignUpResult>;
  signIn: (args: SignInArgs) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ========================
   Helpers
======================== */

function mapSupabaseUserToAppUser(
  sbUser: SupabaseUser | null
): AppUser | null {
  if (!sbUser) return null;

  const plan =
    (sbUser.user_metadata?.plan as PlanId | undefined) ?? ("core" as PlanId);

  const name =
    (sbUser.user_metadata?.full_name as string | undefined) ??
    (sbUser.user_metadata?.name as string | undefined) ??
    sbUser.email ??
    "Trader";

  return {
    id: sbUser.id,
    name,
    email: sbUser.email ?? "",
    plan,
    createdAt: sbUser.created_at ?? new Date().toISOString(),
  };
}

/* ========================
   Provider
======================== */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 1) Cargar sesión inicial
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error) {
          console.error("Error getting Supabase session:", error);
          return;
        }

        if (!mounted) return;

        const currentUser = data.session?.user ?? null;
        setUser(mapSupabaseUserToAppUser(currentUser));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    // 2) Escuchar cambios de sesión
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const u = session?.user ?? null;
        setUser(mapSupabaseUserToAppUser(u));
      }
    );

    return () => {
      subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  /* ---------- Sign up ---------- */
  const signUp = async ({
    firstName,
    lastName,
    email,
    password,
    phone,
    address,
    plan,
  }: SignUpArgs): Promise<SignUpResult> => {
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/signin`
          : undefined;

      // 1) Crear usuario en Supabase Auth
      const { data, error } = await supabaseBrowser.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            phone,
            postal_address: address,
            plan,
          },
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        console.error("Supabase signUp error:", error);
        throw new Error(error.message || "Error creating account.");
      }

      const sbUser = data.user ?? null;
      if (!sbUser) {
        throw new Error("User was not created correctly.");
      }

      // 2) Crear/actualizar fila en public.profiles
      const { error: profileError } = await supabaseBrowser
        .from("profiles")
        .upsert({
          id: sbUser.id,
          email: normalizedEmail,
          first_name: firstName,
          last_name: lastName,
          phone,
          postal_address: address,

          // Campos de suscripción
          plan, // core | advanced (PlanId)
          subscription_status: "pending", // hasta que Stripe confirme
          stripe_customer_id: null, // se llenará luego desde el webhook
          stripe_subscription_id: null, // se llenará luego desde el webhook
        });

      if (profileError) {
        console.error("Error upserting profile:", profileError);
      }

      // 3) Emails mock
      const appUser = mapSupabaseUserToAppUser(sbUser);
      if (appUser) {
        sendWelcomeEmail(appUser).catch(() => {});
        sendSubscriptionReceiptEmail(appUser, plan).catch(() => {});
      }

      // 👉 devolvemos los datos mínimos para el step 2 (billing)
      return {
        userId: sbUser.id,
        email: normalizedEmail,
        plan,
      };
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Sign in ---------- */
  const signIn = async ({ email, password }: SignInArgs) => {
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } =
        await supabaseBrowser.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        console.error("Supabase signIn error:", error);
        throw new Error(error.message || "Invalid credentials.");
      }

      const sbUser = data.user ?? null;
      if (!sbUser) {
        throw new Error("No user returned from Supabase.");
      }

      const appUser = mapSupabaseUserToAppUser(sbUser);
      setUser(appUser);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Sign out ---------- */
  const signOut = async () => {
    setLoading(true);
    try {
      await supabaseBrowser.auth.signOut();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ========================
   Hook
======================== */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
