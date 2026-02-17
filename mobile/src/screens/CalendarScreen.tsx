import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { COLORS } from "../theme";

type DayCell = {
  label: string;
  isToday: boolean;
  isMuted: boolean;
  isoDate: string;
};

type Holiday = { date: string; label: string; marketClosed?: boolean };

function buildCalendarDays(baseDate: Date) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const daysInMonth = end.getDate();
  const startDay = start.getDay(); // 0 Sunday

  const cells: DayCell[] = [];
  for (let i = 0; i < startDay; i += 1) {
    cells.push({ label: "", isToday: false, isMuted: true, isoDate: "" });
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day)
      .toISOString()
      .slice(0, 10);
    const isToday =
      day === today.getDate() &&
      baseDate.getMonth() === today.getMonth() &&
      baseDate.getFullYear() === today.getFullYear();
    cells.push({ label: String(day), isToday, isMuted: false, isoDate });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ label: "", isToday: false, isMuted: true, isoDate: "" });
  }

  return cells;
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset = (7 + weekday - firstOfMonth.getDay()) % 7;
  const day = 1 + firstWeekdayOffset + 7 * (n - 1);
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const offsetBack = (7 + lastOfMonth.getDay() - weekday) % 7;
  const day = lastOfMonth.getDate() - offsetBack;
  return new Date(year, month, day);
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  if (day === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getUsMarketHolidays(year: number, isEs: boolean): Holiday[] {
  const label = (en: string, es: string) => (isEs ? es : en);
  const holidays: Holiday[] = [];

  holidays.push({
    date: toYMD(observedDate(new Date(year, 0, 1))),
    label: label("New Year's Day", "Año Nuevo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)),
    label: label("Martin Luther King Jr. Day", "Día de Martin Luther King Jr."),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)),
    label: label("Presidents' Day", "Día de los Presidentes"),
    marketClosed: true,
  });
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  holidays.push({
    date: toYMD(goodFriday),
    label: label("Good Friday", "Viernes Santo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getLastWeekdayOfMonth(year, 4, 1)),
    label: label("Memorial Day", "Memorial Day"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 5, 19))),
    label: label("Juneteenth", "Juneteenth"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 6, 4))),
    label: label("Independence Day", "Día de la Independencia"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)),
    label: label("Labor Day", "Día del Trabajo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 9, 1, 2)),
    label: label("Columbus / Indigenous Peoples' Day", "Día de Colón / Pueblos Indígenas"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)),
    label: label("Thanksgiving Day", "Día de Acción de Gracias"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 11, 25))),
    label: label("Christmas Day", "Navidad"),
    marketClosed: true,
  });

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

type AccountSeriesResponse = {
  daily: { date: string; value: number }[];
};

type CalendarScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function CalendarScreen({}: CalendarScreenProps) {
  const { language } = useLanguage();
  const [daily, setDaily] = useState<Array<{ date: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();
  const monthLabel = useMemo(
    () =>
      today.toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
        month: "long",
        year: "numeric",
      }),
    [language, today]
  );
  const days = useMemo(() => buildCalendarDays(today), [today]);
  const pnlMap = useMemo(() => new Map(daily.map((d) => [d.date, d.value])), [daily]);
  const holidayMap = useMemo(() => {
    const holidays = getUsMarketHolidays(today.getFullYear(), language === "es");
    return new Map(holidays.map((h) => [h.date, h]));
  }, [today, language]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiGet<AccountSeriesResponse>("/api/account/series");
        if (!active) return;
        setDaily(res.daily ?? []);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load calendar.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScreenScaffold
      title={t(language, "Calendar", "Calendario")}
      subtitle={t(
        language,
        "Track your daily performance and open each journal day.",
        "Sigue tu desempeño diario y abre cada día del journal."
      )}
      scrollable={false}
    >
      <View style={styles.calendarShell}>
        <View style={styles.monthHeader}>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          <Text style={styles.monthSubtitle}>
            {loading
              ? t(language, "Loading daily results…", "Cargando resultados diarios…")
              : t(language, "Tap any day to open your journal.", "Toca cualquier día para abrir tu journal.")}
          </Text>
        </View>

        <View style={styles.weekdays}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <Text key={day} style={styles.weekdayLabel}>
              {language === "es"
                ? { Sun: "D", Mon: "L", Tue: "M", Wed: "X", Thu: "J", Fri: "V", Sat: "S" }[day]
                : day}
            </Text>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>{t(language, "Loading…", "Cargando…")}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
          {days.map((cell, index) => {
            const pnl = cell.isoDate ? pnlMap.get(cell.isoDate) : null;
            const holiday = cell.isoDate ? holidayMap.get(cell.isoDate) : null;
            const isPositive = pnl != null && pnl > 0;
            const isNegative = pnl != null && pnl < 0;
            const isHoliday = !!holiday;
            return (
              <View
                key={`day-${index}`}
                style={[
                  styles.dayCell,
                  cell.isToday && styles.todayCell,
                  cell.isMuted && styles.mutedCell,
                  isPositive && styles.winCell,
                  isNegative && styles.lossCell,
                  isHoliday && styles.holidayCell,
                ]}
              >
                <Text style={[styles.dayLabel, cell.isMuted && styles.mutedLabel]}>
                  {cell.label}
                </Text>
                {isHoliday ? (
                  <>
                    <Text style={styles.holidayTag}>
                      {language === "es" ? "Feriado" : "Holiday"}
                    </Text>
                    <Text style={styles.holidayName} numberOfLines={1}>
                      {holiday?.label}
                    </Text>
                  </>
                ) : pnl != null ? (
                  <Text style={styles.pnlLabel}>{pnl.toFixed(0)}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  calendarShell: {
    flex: 1,
    gap: 12,
  },
  monthHeader: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 4,
  },
  monthTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  monthSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  weekdays: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekdayLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    width: "13%",
    textAlign: "center",
  },
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignContent: "space-between",
  },
  dayCell: {
    width: "13%",
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  todayCell: {
    borderColor: COLORS.primary,
    backgroundColor: "#0F2C2A",
  },
  mutedCell: {
    opacity: 0.4,
  },
  dayLabel: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  mutedLabel: {
    color: COLORS.textMuted,
  },
  pnlLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
  },
  winCell: {
    borderColor: "#1EE6A8",
    backgroundColor: "#0F2C2A",
  },
  lossCell: {
    borderColor: "#2E90FF",
    backgroundColor: "#0B1E3A",
  },
  holidayCell: {
    borderColor: "#D6B36A",
    backgroundColor: "#2A1D0B",
  },
  holidayTag: {
    color: "#F2D7A3",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  holidayName: {
    color: "#F2D7A3",
    fontSize: 8,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
});
