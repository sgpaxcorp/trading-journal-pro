import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabaseMobile } from "./supabase";

export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabaseMobile) return undefined;

    let active = true;

    supabaseMobile.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabaseMobile.auth.onAuthStateChange(() => {
      supabaseMobile?.auth.getUser().then(({ data }) => {
        if (!active) return;
        setUser(data.user ?? null);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return user;
}
