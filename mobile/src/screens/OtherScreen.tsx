import { useMemo } from "react";
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
  const planLabel = planAccess.plan === "advanced" ? "Advanced" : "Core";

  const openWebModule = (params: {
    title: string;
    description: string;
    badge: string;
    detail: string;
    path: string;
  }) => {
    onOpenModule(params.title, params.description, {
      badge: params.badge,
      detail: params.detail,
      ctaLabel: t(language, "Open on web", "Abrir en web"),
      ctaUrl: `${WEB_BASE}${params.path}`,
    });
  };

  return (
    <ScreenScaffold
      title={t(language, "Business Workspace", "Workspace Empresarial")}
      subtitle={t(
        language,
        "The trading business platform, organized by plan access and adapted for mobile.",
        "La plataforma empresarial de trading, organizada por acceso del plan y adaptada para móvil."
      )}
      showBrand={false}
      compactHeader
    >
      <View style={styles.section}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>{t(language, "Business access summary", "Resumen de acceso empresarial")}</Text>
          <Text style={styles.summaryTitle}>
            {t(
              language,
              "Your mobile workspace mirrors the same trading business map used on the web platform.",
              "Tu workspace móvil refleja el mismo mapa de empresa de trading que usa la plataforma web."
            )}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Plan", "Plan")}</Text>
              <Text style={styles.summaryPillValue}>{planLabel}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Business AI Coach", "Coach Empresarial IA")}</Text>
              <Text style={styles.summaryPillValue}>
                {planAccess.hasAICoaching ? t(language, "Included", "Incluido") : "Advanced"}
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Business Notebook", "Notebook Empresarial")}</Text>
              <Text style={styles.summaryPillValue}>
                {planAccess.hasNotebook ? t(language, "Included", "Incluido") : "Advanced"}
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>{t(language, "Broker Sync", "Broker Sync")}</Text>
              <Text style={styles.summaryPillValue}>
                {planAccess.hasBrokerSync ? t(language, "Active", "Activo") : t(language, "Add-on", "Add-on")}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Mobile business workspace", "Workspace empresarial móvil")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Fast access to the modules that already run natively on iPhone and iPad.",
              "Acceso rápido a los módulos que ya corren nativamente en iPhone y iPad."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Daily workflow", "Flujo diario")}
            title={t(language, "Execution Journal", "Registro de Ejecución")}
            description={t(
              language,
              "Premarket, inside trade, after trade, mindset, checklist, and ink notes for the trading business.",
              "Premarket, inside trade, after trade, mindset, checklist y notas ink para la empresa de trading."
            )}
            badges={["Mobile", "Core"]}
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
            badges={planAccess.hasNotebook ? ["Mobile", "Advanced"] : ["Mobile", "Advanced", "Locked"]}
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
            badges={planAccess.hasBrokerSync ? ["Mobile", "Add-on", "Active"] : ["Mobile", "Add-on"]}
            iconName="link-outline"
            onPress={onOpenBrokerConnect}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Business platform workspaces", "Workspaces empresariales de plataforma")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "These modules stay aligned with web and open there when you need the full desktop workspace.",
              "Estos módulos se mantienen alineados con web y se abren allá cuando necesitas el workspace completo de desktop."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Business planning", "Planificación empresarial")}
            title={t(language, "Trading Business Plan", "Plan de Empresa de Trading")}
            description={t(
              language,
              "Checkpoint planning, realistic targets, and your business execution system.",
              "Planificación de checkpoints, metas realistas y tu sistema de ejecución empresarial."
            )}
            badges={["Web", "Core"]}
            iconName="trending-up-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Trading Business Plan", "Plan de Empresa de Trading"),
                description: t(
                  language,
                  "Business checkpoints, strategy structure, and execution rules live on the web workspace.",
                  "Los checkpoints empresariales, la estructura de estrategia y las reglas de ejecución viven en el workspace web."
                ),
                badge: t(language, "Web workspace", "Workspace web"),
                detail: t(
                  language,
                  "Use Trading Business Plan on web for full checkpoint editing, system design, and plan progression control.",
                  "Usa Plan de Empresa de Trading en web para edición completa de checkpoints, diseño del sistema y control de progresión del plan."
                ),
                path: "/growth-plan",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Broker imports", "Imports del bróker")}
            title={t(language, "Imports", "Imports")}
            description={t(
              language,
              "Statements, order history, and CSV/XLSX broker files.",
              "Statements, historial de órdenes y archivos CSV/XLSX del bróker."
            )}
            badges={["Web", "Core"]}
            iconName="download-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Imports", "Imports"),
                description: t(
                  language,
                  "Manual imports and broker file ingestion stay on the web platform.",
                  "Los imports manuales y la ingestión de archivos del bróker se mantienen en la plataforma web."
                ),
                badge: t(language, "Web workspace", "Workspace web"),
                detail: t(
                  language,
                  "Use the web imports page for statements, order history, and supported CSV/XLSX files.",
                  "Usa la página web de imports para statements, order history y archivos CSV/XLSX soportados."
                ),
                path: "/import",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Business protection", "Protección empresarial")}
            title={t(language, "Business Protection System", "Sistema de Protección Empresarial")}
            description={t(
              language,
              "Plan-based alarms, business briefings, and rule protection.",
              "Alarmas, briefings empresariales y protección conectados al plan."
            )}
            badges={["Web", "Core"]}
            iconName="shield-checkmark-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Business Protection System", "Sistema de Protección Empresarial"),
                description: t(
                  language,
                  "Protection alarms and business briefings are managed on the web workspace.",
                  "Las alarmas de protección y los briefings empresariales se gestionan en el workspace web."
                ),
                badge: t(language, "Web workspace", "Workspace web"),
                detail: t(
                  language,
                  "Core includes plan-based alarms. Advanced expands the rule layer and protection feedback.",
                  "Core incluye alarmas conectadas al plan. Advanced expande la capa de reglas y el feedback de protección."
                ),
                path: "/rules-alarms/alarms",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Trade review", "Revisión de trades")}
            title={t(language, "Back-Study", "Back-Study")}
            description={t(
              language,
              "Replay, review, and study past executions in the web workspace.",
              "Replay, review y estudio de ejecuciones pasadas en el workspace web."
            )}
            badges={["Web", "Core"]}
            iconName="search-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Back-Study", "Back-Study"),
                description: t(
                  language,
                  "Back-study and replay workflows remain on the web platform.",
                  "Los flujos de back-study y replay permanecen en la plataforma web."
                ),
                badge: t(language, "Web workspace", "Workspace web"),
                detail: t(
                  language,
                  "Core and Advanced include trade review. Web gives you the larger workspace for charts, replay, and deeper notes.",
                  "Core y Advanced incluyen trade review. Web te da el workspace más amplio para charts, replay y notas profundas."
                ),
                path: "/back-study",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Business reporting", "Reporte de negocio")}
            title={t(language, "Profit & Loss Track", "Profit & Loss Track")}
            description={t(
              language,
              "Track business costs, profitability, and operating overhead.",
              "Sigue costos de negocio, rentabilidad y gastos operativos."
            )}
            badges={planAccess.hasProfitLossTrack ? ["Web", "Advanced"] : ["Web", "Advanced", "Locked"]}
            iconName="wallet-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Profit & Loss Track", "Profit & Loss Track"),
                description: t(
                  language,
                  "Business accounting, budgets, and profitability stay on the web workspace.",
                  "La contabilidad del negocio, presupuestos y rentabilidad se mantienen en el workspace web."
                ),
                badge: planAccess.hasProfitLossTrack ? "Advanced" : t(language, "Advanced required", "Requiere Advanced"),
                detail: t(
                  language,
                  "Profit & Loss Track belongs to Advanced and is designed as a larger desktop workspace for business control.",
                  "Profit & Loss Track pertenece a Advanced y está diseñado como un workspace desktop más amplio para control del negocio."
                ),
                path: "/performance/profit-loss-track",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Business reporting", "Reporte de negocio")}
            title={t(language, "Cashflow tracking", "Seguimiento de cashflow")}
            description={t(
              language,
              "Deposits, withdrawals, and account equity adjustments tied to your plan.",
              "Depósitos, retiros y ajustes de equity conectados a tu plan."
            )}
            badges={planAccess.hasCashflowTracking ? ["Web", "Advanced"] : ["Web", "Advanced", "Locked"]}
            iconName="cash-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Cashflow tracking", "Seguimiento de cashflow"),
                description: t(
                  language,
                  "Cashflow tracking is part of the web performance workspace.",
                  "El seguimiento de cashflow forma parte del workspace web de performance."
                ),
                badge: planAccess.hasCashflowTracking ? "Advanced" : t(language, "Advanced required", "Requiere Advanced"),
                detail: t(
                  language,
                  "Cashflows stay separate from P&L so your plan progress remains realistic and clean.",
                  "Los cashflows se mantienen separados del P&L para que el progreso del plan siga siendo realista y limpio."
                ),
                path: "/performance/plan",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Broker audit", "Auditoría del bróker")}
            title={t(language, "Order Audit", "Order Audit")}
            description={t(
              language,
              "Execution review, order history audit, and broker data verification.",
              "Revisión de ejecución, auditoría de historial de órdenes y verificación de data."
            )}
            badges={planAccess.hasOrderAudit ? ["Web", "Advanced"] : ["Web", "Advanced", "Locked"]}
            iconName="clipboard-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Order Audit", "Order Audit"),
                description: t(
                  language,
                  "Order audit remains in the web workspace.",
                  "La auditoría de órdenes permanece en el workspace web."
                ),
                badge: planAccess.hasOrderAudit ? "Advanced" : t(language, "Advanced required", "Requiere Advanced"),
                detail: t(
                  language,
                  "Use the audit workspace to verify fills, timestamps, and broker-import quality before trusting analytics.",
                  "Usa el workspace de auditoría para verificar fills, timestamps y la calidad del import antes de confiar en las analíticas."
                ),
                path: "/audit/order-history",
              })
            }
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Intelligence & community", "Inteligencia y comunidad")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Controlled modules, beta workspaces, and community surfaces tied to the main platform.",
              "Módulos controlados, workspaces beta y superficies de comunidad conectadas a la plataforma principal."
            )}
          </Text>

          <ModuleTile
            eyebrow={t(language, "Private beta", "Beta privada")}
            title={t(language, "Option Flow Intelligence", "Option Flow Intelligence")}
            description={t(
              language,
              "Turns options flow uploads into a structured premarket report with AI assistance.",
              "Convierte uploads de options flow en un reporte premarket estructurado con ayuda de IA."
            )}
            badges={planAccess.hasOptionFlow ? ["Web", "Beta", "Active"] : ["Web", "Beta"]}
            iconName="pulse-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Option Flow Intelligence", "Option Flow Intelligence"),
                description: t(
                  language,
                  "Option Flow Intelligence is still in development and private beta mode.",
                  "Option Flow Intelligence sigue en desarrollo y en modo de beta privada."
                ),
                badge: t(language, "Private beta", "Beta privada"),
                detail: t(
                  language,
                  "This module analyzes options flow files or screenshots and turns them into a structured premarket report. Public self-service access is disabled while testing continues.",
                  "Este módulo analiza archivos o screenshots de options flow y los convierte en un reporte premarket estructurado. El acceso público self-service está deshabilitado mientras continúa el testing."
                ),
                path: "/option-flow",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Research lab", "Laboratorio de research")}
            title={t(language, "Neuro Analysis", "Neuro Analysis")}
            description={t(
              language,
              "Company intelligence, projection scenarios, and allocation simulation.",
              "Inteligencia de compañías, escenarios de proyección y simulación de allocation."
            )}
            badges={planAccess.hasNeuroAnalysis ? ["Web", "Active"] : ["Web", "Controlled"]}
            iconName="analytics-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Neuro Analysis", "Neuro Analysis"),
                description: t(
                  language,
                  "Neuro Analysis stays as a larger web workspace for company research and simulation.",
                  "Neuro Analysis se mantiene como un workspace web más grande para research de compañías y simulación."
                ),
                badge: planAccess.hasNeuroAnalysis ? t(language, "Web access", "Acceso web") : t(language, "Controlled access", "Acceso controlado"),
                detail: t(
                  language,
                  "Use Neuro Analysis when you want structured company research, forward scenarios, and virtual allocation testing outside the execution journal.",
                  "Usa Neuro Analysis cuando quieras research estructurado de compañías, escenarios forward y pruebas virtuales de allocation fuera del registro de ejecución."
                ),
                path: "/neuro-analysis",
              })
            }
          />
          <ModuleTile
            eyebrow={t(language, "Community feed", "Feed de comunidad")}
            title={t(language, "Forum", "Foro")}
            description={t(
              language,
              "Community feed, posts, and shared discussion space.",
              "Feed de comunidad, publicaciones y espacio compartido de discusión."
            )}
            badges={planAccess.hasForum ? ["Web", "Active"] : ["Web"]}
            iconName="people-outline"
            onPress={() =>
              openWebModule({
                title: t(language, "Forum", "Foro"),
                description: t(
                  language,
                  "The community feed lives on the web platform today.",
                  "El feed de comunidad vive hoy en la plataforma web."
                ),
                badge: t(language, "Web workspace", "Workspace web"),
                detail: t(
                  language,
                  "Use the forum for community posts and discussion threads in the full web experience.",
                  "Usa el foro para publicaciones de comunidad y discusiones dentro de la experiencia web completa."
                ),
                path: "/forum/community-feed",
              })
            }
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Business account & support", "Cuenta empresarial y soporte")}</Text>
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Settings, security, and platform references.",
              "Ajustes, seguridad y referencias de plataforma."
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
            eyebrow={t(language, "Website", "Website")}
            title={t(language, "Open platform", "Abrir plataforma")}
            description={t(
              language,
              "Jump to the full web platform when you need desktop-level workspaces.",
              "Salta a la plataforma web completa cuando necesites workspaces de nivel desktop."
            )}
            badges={["Web"]}
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
            badges={["Web"]}
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
