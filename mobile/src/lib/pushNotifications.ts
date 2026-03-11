import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiPost } from "./api";

export type PushRegistrationResult = {
  status: "granted" | "denied" | "undetermined";
  pushToken: string | null;
  dailyReminderEnabled: boolean | null;
};

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#34d399",
    sound: "default",
  });
}

function getProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
    undefined
  );
}

export async function registerDeviceForPush(options: {
  locale: string;
  promptIfNeeded?: boolean;
  dailyReminderEnabled?: boolean;
}): Promise<PushRegistrationResult> {
  await ensureAndroidChannel();

  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;

  if (status !== "granted" && options.promptIfNeeded) {
    const request = await Notifications.requestPermissionsAsync();
    status = request.status;
  }

  if (status !== "granted") {
    return {
      status,
      pushToken: null,
      dailyReminderEnabled: null,
    };
  }

  const projectId = getProjectId();
  const tokenData = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  const pushToken = tokenData.data ?? null;
  if (!pushToken) {
    return {
      status,
      pushToken: null,
      dailyReminderEnabled: null,
    };
  }

  const res = await apiPost<{
    ok: boolean;
    token?: { daily_reminder_enabled?: boolean | null };
  }>("/api/notifications/register", {
    expoPushToken: pushToken,
    platform: Platform.OS,
    deviceId: Device.osInternalBuildId ?? null,
    deviceName: Device.deviceName || Device.modelName || null,
    locale: options.locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(typeof options.dailyReminderEnabled === "boolean"
      ? { dailyReminderEnabled: options.dailyReminderEnabled }
      : {}),
  });

  return {
    status,
    pushToken,
    dailyReminderEnabled:
      typeof res?.token?.daily_reminder_enabled === "boolean"
        ? res.token.daily_reminder_enabled
        : null,
  };
}
