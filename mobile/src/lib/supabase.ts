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
    const secureValue = await SecureStore.getItemAsync(key, secureStoreOptions);
    if (secureValue != null) {
      return secureValue;
    }

    // One-time silent migration from the legacy AsyncStorage session store.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue != null) {
      await SecureStore.setItemAsync(key, legacyValue, secureStoreOptions);
      await AsyncStorage.removeItem(key);
    }
    return legacyValue;
  },
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, secureStoreOptions),
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key, secureStoreOptions);
    await AsyncStorage.removeItem(key);
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
