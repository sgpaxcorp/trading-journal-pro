import { useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import { Linking, StyleSheet, Text, View } from "react-native";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import type { OpenModuleFn } from "../lib/moduleNavigation";
import { useTheme } from "../lib/ThemeContext";
import type { MobilePlanAccess } from "../lib/usePlanAccess";
import { type ThemeColors } from "../theme";

type OtherScreenProps = {
  onOpenModule: OpenModuleFn;
  onOpenSettings: () => void;
  onOpenNotebook: () => void;
  onOpenJournalDate: () => void;
  onOpenBrokerConnect: () => void;
  planAccess: MobilePlanAccess;
};

const WEB_BASE = "https://www.neurotrader-journal.com";

export function OtherScreen({
  onOpenModule,
  onOpenSettings,
  onOpenNotebook,
  onOpenJournalDate,
  onOpenBrokerConnect,
  planAccess,
}: OtherScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  return (
    <ScreenScaffold
      title={t(language, "Command Center", "Centro de Mando")}
      subtitle={t(
        language,
        "Use the app as your trading business monitoring center for KPIs, coaching, planning, notes, and consulting prep.",
        "Usa el app como tu centro de monitoreo empresarial para KPIs, coaching, planificación, notas y preparación de consultoría."
      )}
      showBrand={false}
      compactHeader
    >
      <View style={styles.section}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>{t(language, "Mobile strategy", "Estrategia móvil")}</Text>
          <Text style={styles.summaryTitle}>
            {t(
              language,
              "This app is built to help you monitor the business, review execution, talk with AI, and stay ready for consulting sessions.",
              "Este app está hecho para ayudarte a monitorear el negocio, revisar la ejecución, hablar con la IA y llegar listo a sesiones de consultoría."
            )}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Monitoring", "Monitoreo")}</Text>
              <Text style={styles.summaryPillValue}>{t(language, "Dashboard + KPIs", "Dashboard + KPIs")}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Coaching", "Coaching")}</Text>
              <Text style={styles.summaryPillValue}>
                {planAccess.hasAICoaching ? t(language, "AI ready", "IA lista") : t(language, "Upgrade to unlock", "Activa para desbloquear")}
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Planning", "Planificación")}</Text>
              <Text style={styles.summaryPillValue}>
                {planAccess.hasNotebook ? t(language, "Notebook ready", "Notebook listo") : t(language, "Journal-driven", "Guiado por journal")}
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Consulting", "Consultoría")}</Text>
              <Text style={styles.summaryPillValue}>
                {t(language, "Review-ready workflow", "Flujo listo para revisión")}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Inside the app", "Dentro del app")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Everything below can be used directly on iPhone and iPad as part of your daily operating flow.",
              "Todo lo siguiente se puede usar directamente en iPhone y iPad como parte de tu flujo operativo diario."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Monitoring", "Monitoreo")}
            title={t(language, "Business Center", "Centro Empresarial")}
            description={t(
              language,
              "Monitor account progress, weekly P&L, daily coach message, trading system, and execution direction.",
              "Monitorea el progreso de la cuenta, el P&L semanal, el mensaje diario del coach, el trading system y la dirección de la ejecución."
            )}
            badges={["App", "Monitor"]}
            iconName="home-outline"
            onPress={() => navigation.navigate("Dashboard")}
          />
          <ModuleTile
            eyebrow={t(language, "KPIs", "KPIs")}
            title={t(language, "Business KPIs", "KPIs Empresariales")}
            description={t(
              language,
              "Review performance, risk, edge behavior, timing, and business quality from one mobile screen.",
              "Revisa desempeño, riesgo, comportamiento del edge, timing y calidad del negocio desde una sola pantalla móvil."
            )}
            badges={["App", "KPIs"]}
            iconName="stats-chart-outline"
            onPress={() => navigation.navigate("Analytics")}
          />
          <ModuleTile
            eyebrow={t(language, "Coaching", "Coaching")}
            title={t(language, "Business AI Coach", "Coach Empresarial IA")}
            description={t(
              language,
              "Talk through execution, discipline, mindset, and business adjustments with context from your records.",
              "Habla sobre ejecución, disciplina, mindset y ajustes del negocio con contexto tomado de tus registros."
            )}
            badges={planAccess.hasAICoaching ? ["App", "AI"] : ["App", "AI", "Locked"]}
            iconName="sparkles-outline"
            onPress={() => navigation.navigate("AICoach")}
          />
          <ModuleTile
            eyebrow={t(language, "Daily workflow", "Flujo diario")}
            title={t(language, "Execution Journal", "Registro de Ejecución")}
            description={t(
              language,
              "Premarket, inside trade, after trade, mindset, checklist, and ink notes for the trading business.",
              "Premarket, inside trade, after trade, mindset, checklist y notas ink para la empresa de trading."
            )}
            badges={["App", "Journal"]}
            iconName="reader-outline"
            onPress={onOpenJournalDate}
          />
          <ModuleTile
            eyebrow={t(language, "Research notes", "Notas y research")}
            title={t(language, "Business Notebook", "Notebook Empresarial")}
            description={t(
              language,
              "Daily business pages plus custom notebooks, sections, and pages.",
              "Páginas empresariales diarias más notebooks custom, secciones y páginas."
            )}
            badges={planAccess.hasNotebook ? ["App", "Notebook"] : ["App", "Notebook", "Locked"]}
            iconName="document-text-outline"
            onPress={onOpenNotebook}
          />
          <ModuleTile
            eyebrow={t(language, "Broker data", "Data del bróker")}
            title={t(language, "Broker connect", "Conectar bróker")}
            description={t(
              language,
              "Connect and sync your broker account from mobile when the add-on is active.",
              "Conecta y sincroniza tu cuenta de bróker desde móvil cuando el add-on esté activo."
            )}
            badges={planAccess.hasBrokerSync ? ["App", "Broker", "Active"] : ["App", "Broker"]}
            iconName="link-outline"
            onPress={onOpenBrokerConnect}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Planning & consulting", "Planificación y consultoría")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Use these flows to organize your business plan, prepare review sessions, and keep your decision process consultable.",
              "Usa estos flujos para organizar tu plan empresarial, preparar sesiones de revisión y mantener tu proceso de decisión consultable."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Business planning", "Planificación empresarial")}
            title={t(language, "Business Plan Workflow", "Flujo de Plan Empresarial")}
            description={t(
              language,
              "Use Dashboard, KPIs, Journal, and Notebook together to shape targets, system rules, and operating structure.",
              "Usa Dashboard, KPIs, Journal y Notebook juntos para dar forma a metas, reglas del sistema y estructura operativa."
            )}
            badges={["App", "Planning"]}
            iconName="trending-up-outline"
            onPress={() =>
              onOpenModule(
                t(language, "Business Plan Workflow", "Flujo de Plan Empresarial"),
                t(
                  language,
                  "The mobile app is your monitoring center: use the dashboard for progress, KPIs for truth, journal for evidence, notebook for structure, and AI Coach for reinforcement.",
                  "El app móvil es tu centro de monitoreo: usa el dashboard para progreso, KPIs para verdad, journal para evidencia, notebook para estructura y el Coach IA para refuerzo."
                ),
                {
                  badge: t(language, "App workflow", "Flujo del app"),
                  detail: t(
                    language,
                    "This creates a clean business-planning loop for trader entrepreneurs: observe, journal, review, adjust, and execute again with more clarity.",
                    "Esto crea un loop limpio de planificación empresarial para trader entrepreneurs: observa, documenta, revisa, ajusta y vuelve a ejecutar con más claridad."
                  ),
                }
              )
            }
          />
          <ModuleTile
            eyebrow={t(language, "Consulting prep", "Preparación de consultoría")}
            title={t(language, "Review Session Workflow", "Flujo de Sesión de Revisión")}
            description={t(
              language,
              "Turn your notes, KPIs, and AI feedback into a clean review narrative for yourself or a consulting session.",
              "Convierte tus notas, KPIs y feedback de IA en una narrativa de revisión limpia para ti o para una sesión de consultoría."
            )}
            badges={["App", "Consulting"]}
            iconName="people-outline"
            onPress={() =>
              onOpenModule(
                t(language, "Review Session Workflow", "Flujo de Sesión de Revisión"),
                t(
                  language,
                  "Use the app to arrive prepared: review KPIs, scan journal entries, pull AI guidance, and keep notebook pages ready for decision review or consulting.",
                  "Usa el app para llegar preparado: revisa KPIs, escanea entradas del journal, saca guía del Coach IA y mantén páginas del notebook listas para revisión de decisiones o consultoría."
                ),
                {
                  badge: t(language, "Consulting-ready", "Listo para consultoría"),
                  detail: t(
                    language,
                    "The best mobile workflow is simple: monitor the business, capture the session, review the evidence, and document the next adjustment before the next market open.",
                    "El mejor flujo móvil es simple: monitorea el negocio, captura la sesión, revisa la evidencia y documenta el siguiente ajuste antes de la próxima apertura."
                  ),
                }
              )
            }
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Account & support", "Cuenta y soporte")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Keep the account secure and maintain quick access to the main NeuroTrader references when needed.",
              "Mantén la cuenta segura y conserva acceso rápido a las referencias principales de NeuroTrader cuando las necesites."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Trader Entrepreneur Account", "Cuenta de Empresario Trader")}
            title={t(language, "Settings", "Ajustes")}
            description={t(
              language,
              "Trader identity, security, notifications, and appearance.",
              "Identidad trader, seguridad, notificaciones y apariencia."
            )}
            badges={["Mobile"]}
            iconName="settings-outline"
            onPress={onOpenSettings}
          />
          <ModuleTile
            eyebrow={t(language, "NeuroTrader", "NeuroTrader")}
            title={t(language, "Open main site", "Abrir sitio principal")}
            description={t(
              language,
              "Open the main NeuroTrader site for account references, documents, or external navigation.",
              "Abre el sitio principal de NeuroTrader para referencias de cuenta, documentos o navegación externa."
            )}
            badges={["Site"]}
            iconName="globe-outline"
            onPress={() => Linking.openURL(WEB_BASE)}
          />
          <ModuleTile
            eyebrow={t(language, "Legal", "Legal")}
            title={t(language, "Terms & Privacy", "Términos y privacidad")}
            description={t(
              language,
              "Review legal and privacy references from the main website.",
              "Revisa referencias legales y de privacidad desde el website principal."
            )}
            badges={["Site"]}
            iconName="shield-checkmark-outline"
            onPress={() => Linking.openURL(`${WEB_BASE}/terms`)}
          />
        </View>
      </View>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: 14,
    },
    summaryCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 10,
    },
    summaryEyebrow: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    summaryTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "700",
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    summaryPill: {
      flexBasis: "48%",
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    summaryPillLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    summaryPillValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "800",
    },
    sectionCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 12,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
  });
