import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SECURE_STORE_SERVICE = "ntj_supabase_auth";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainService: SECURE_STORE_SERVICE,
};

const storageAdapter = {
  async getItem(key: string) {
    try {
      const secureValue = await SecureStore.getItemAsync(key, secureStoreOptions);
      if (secureValue != null) {
        return secureValue;
      }
    } catch {
      // Keep authentication usable if Keychain is temporarily unavailable.
      return AsyncStorage.getItem(key);
    }

    // One-time silent migration from the legacy AsyncStorage session store.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue != null) {
      try {
        await SecureStore.setItemAsync(key, legacyValue, secureStoreOptions);
        await AsyncStorage.removeItem(key);
      } catch {
        // Retain the legacy value until Keychain is available again.
      }
    }
    return legacyValue;
  },
  async setItem(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value, secureStoreOptions);
      await AsyncStorage.removeItem(key);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string) {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key, secureStoreOptions),
      AsyncStorage.removeItem(key),
    ]);
  },
};

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseMobile = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
