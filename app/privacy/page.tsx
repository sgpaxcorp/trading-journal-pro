"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import PublicHomeLogoLink from "@/app/components/PublicHomeLogoLink";

const CONTENT = {
  en: {
    intro:
      "This Privacy Policy explains how Neuro Trader (\"NTJ\", \"we\", \"us\", or \"our\"), operated by SG PAX CORP., collects, uses, shares, and protects information in connection with the Neuro Trader website, applications, and related services (collectively, the \"Service\").",
    sections: [
      {
        title: "1. Scope",
        body:
          "This Privacy Policy applies to information collected through the Service. It does not apply to third-party websites, apps, or services that may be linked to or integrated with the Service.",
      },
      {
        title: "2. Information We Collect",
        bullets: [
          "Account Information: name, email address, login credentials (stored in hashed form where applicable), and subscription status.",
          "Legal Acceptance Records: Terms and Privacy Policy versions accepted, acceptance timestamps, checkout disclosures, IP address, user agent, and related audit metadata.",
          "Trading Business Data: execution records, trade records, fills, timestamps, instrument details, commissions/fees, screenshots, notes, tags, plans, and related analytics inputs.",
          "Integration Data: information you authorize us to import from third-party platforms, including broker/platform statements, trade history, order history, account identifiers, balances, holdings, positions, transactions, fees, commissions, timestamps, and related metadata when those integrations are enabled.",
          "Usage, Device, and Mobile Data: log data and analytics about how you use the Service (e.g., pages viewed, features used, device/browser information, app version, operating system, IP address, crash/debug data, and push-notification tokens if notifications are enabled).",
          "Support Communications: messages and attachments you send to our support team.",
          "Payment Information: billing details, trial status, renewal status, cancellation status, receipt details, and subscription metadata processed by Stripe or another payment processor (we typically do not store full card numbers).",
        ],
      },
      {
        title: "3. How We Use Information",
        bullets: [
          "Provide and operate the Service, including calculating metrics and rendering dashboards.",
          "Process subscriptions, payments, and account authentication.",
          "Import and synchronize data from integrations you authorize.",
          "Provide customer support, respond to requests, and send service-related messages.",
          "Improve and maintain the Service, including debugging, monitoring, and analytics.",
          "Enforce our Terms of Service, prevent fraud, and protect the security of the Service.",
        ],
      },
      {
        title: "4. Business AI Coaching and Automated Processing",
        body:
          "If you use Business AI Coaching features, NTJ may process your trading business data, execution records, notes, plans, screenshots, imported broker data, analytics, and related context through OpenAI or other AI service providers to generate educational summaries, insights, simulations, and suggestions. Business AI Coaching outputs depend on the data you provide or import. You are responsible for ensuring your inputs are accurate and complete. Business AI Coaching may produce inaccurate, incomplete, outdated, or misleading output. You should independently evaluate any Business AI Coaching output before relying on it.",
      },
      {
        title: "4.1 Educational and Non-Advisory Use",
        body:
          "Analytics, projections, simulations, Business AI Coaching, Neuro Analysis, Option Flow Intelligence, dashboards, reports, and similar outputs are provided for educational, journaling, research, simulation, and business-accountability purposes only. They are not financial, investment, trading, legal, tax, or accounting advice; they do not recommend that you buy, sell, hold, or trade any instrument; and they do not guarantee profits, income, capital growth, improved trading performance, or any specific result.",
      },
      {
        title: "5. How We Share Information",
        bullets: [
          "We do not sell your personal information.",
          "Service Providers: with vendors who help us operate the Service under contractual obligations, including hosting, database, authentication, storage, payment processing, AI processing, email, support, security, app distribution, monitoring, and analytics providers.",
          "Integrations You Enable: with third-party platforms when you choose to connect them (data flows may occur between NTJ and the third party based on your authorization).",
          "Legal and Safety: to comply with law, court orders, or requests by public authorities, or to protect the rights, safety, and security of NTJ, our users, or others.",
          "Business Transfers: in connection with a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets (subject to applicable law).",
          "Public Sharing Features (Optional): if you choose to share trades, summaries, or other content publicly, that content may be visible to others based on your settings.",
        ],
      },
      {
        title: "5.1 Current Service Providers and API Accounts",
        bullets: [
          "Supabase may be used for authentication, database, storage, and backend services.",
          "Vercel may be used for hosting, serverless functions, deployment, and operational logs.",
          "Stripe may be used for subscriptions, checkout, billing, invoices, taxes, and payment-related customer records.",
          "OpenAI or other AI providers may be used to generate AI-assisted coaching, summaries, analysis, and support responses based on the data you submit or authorize.",
          "Expo, Apple, and Google may be used for mobile app builds, app distribution, push notifications, device services, and store operations.",
          "Email, security, analytics, support, and abuse-prevention providers such as Resend, hCaptcha, and similar vendors may process limited data needed to operate those features.",
        ],
      },
      {
        title: "5.2 Broker Integrations; Currently Disabled Until Approval",
        body:
          "Direct broker integrations, including SnapTrade and Webull, are currently intended to remain disabled until provider approvals and production readiness are complete. If you later enable a broker connection, NTJ and its service providers may exchange data with that broker or broker-connectivity provider based on your authorization. This may include account identifiers, balances, holdings, positions, orders, activities, transactions, fills, fees, commissions, timestamps, OAuth tokens or authorization metadata, and sync logs. Broker connections are intended for importing, synchronizing, displaying, auditing, and analyzing your trading data; NTJ does not use them to place trades, withdraw funds, or custody assets. You may disconnect supported integrations where the Service provides that option or contact support for deletion requests.",
      },
      {
        title: "6. Cookies and Analytics",
        body:
          "We may use cookies and similar technologies to keep you logged in, remember preferences, and understand how the Service is used. We may use third-party analytics providers to collect statistical information such as IP address, device/browser type, and usage events. These analytics are used to improve the Service and are not intended to identify you personally beyond what is necessary to provide the Service.",
      },
      {
        title: "7. Data Retention",
        body:
          "We retain information for as long as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. Retention periods may vary depending on the type of information and how it is used.",
      },
      {
        title: "8. Security",
        body:
          "We implement reasonable administrative, technical, and physical safeguards designed to protect information. However, no security system is impenetrable. You are responsible for using a strong password and protecting your account credentials.",
      },
      {
        title: "9. Your Choices and Rights",
        body:
          "Depending on your location, you may have rights to access, correct, delete, or export certain information, and to object to or restrict certain processing. You may also opt out of non-essential marketing communications, disconnect supported integrations, and request deletion of imported broker data or account data where required by law. To request action, contact us at support@neurotrader-journal.com.",
      },
      {
        title: "10. International Transfers",
        body:
          "If you access the Service from outside the country where our servers or service providers are located, your information may be transferred to and processed in those locations. We take steps designed to ensure that such transfers are handled in accordance with applicable law.",
      },
      {
        title: "11. Children's Privacy",
        body:
          "The Service is not directed to children and is not intended for individuals under 18. We do not knowingly collect personal information from children. If you believe a child has provided personal information to us, contact support@neurotrader-journal.com.",
      },
      {
        title: "12. Changes to This Privacy Policy",
        body:
          "We may update this Privacy Policy from time to time. The updated version will be effective when posted or otherwise made available to you. For material changes, we may require you to check an acceptance box before continuing to use private features or completing checkout.",
      },
      {
        title: "13. Contact",
        body:
          "For questions or requests regarding this Privacy Policy, contact: support@neurotrader-journal.com.",
      },
    ],
  },
  es: {
    intro:
      "Esta Política de Privacidad explica cómo Neuro Trader (\"NTJ\", \"nosotros\", \"nos\" o \"nuestro\"), operado por SG PAX CORP., recopila, utiliza, comparte y protege la información en relación con el sitio web, las aplicaciones y los servicios relacionados de Neuro Trader (colectivamente, el \"Servicio\").",
    sections: [
      {
        title: "1. Alcance",
        body:
          "Esta Política de Privacidad se aplica a la información recopilada a través del Servicio. No se aplica a sitios web, aplicaciones o servicios de terceros que puedan estar vinculados o integrados con el Servicio.",
      },
      {
        title: "2. Información que recopilamos",
        bullets: [
          "Información de cuenta: nombre, correo electrónico, credenciales de inicio de sesión (almacenadas en forma cifrada cuando corresponda) y estado de suscripción.",
          "Registros de aceptación legal: versiones aceptadas de Términos y Política de Privacidad, timestamps de aceptación, divulgaciones de checkout, dirección IP, user agent y metadata de auditoría relacionada.",
          "Datos de la empresa de trading: registros de ejecución, operaciones, fills, timestamps, detalles del instrumento, comisiones/tarifas, screenshots, notas, etiquetas, planes y entradas relacionadas con analítica.",
          "Datos de integraciones: información que autorizas a importar desde plataformas de terceros, incluyendo statements de broker/plataforma, historial de trades, historial de órdenes, identificadores de cuenta, balances, holdings, posiciones, transacciones, fees, comisiones, timestamps y metadata relacionada cuando esas integraciones estén habilitadas.",
          "Datos de uso, dispositivo y móvil: logs y analítica sobre cómo usas el Servicio (páginas vistas, funciones utilizadas, información del dispositivo/navegador, versión de la app, sistema operativo, dirección IP, datos de fallos/depuración y tokens de notificaciones push si las notificaciones están habilitadas).",
          "Comunicaciones de soporte: mensajes y adjuntos enviados a nuestro equipo de soporte.",
          "Información de pagos: datos de facturación, estado de trial, renovación, cancelación, detalles de recibos y metadata de suscripción procesados por Stripe u otro proveedor de pagos (normalmente no almacenamos números completos de tarjeta).",
        ],
      },
      {
        title: "3. Cómo usamos la información",
        bullets: [
          "Proveer y operar el Servicio, incluyendo cálculos de métricas y visualización de dashboards.",
          "Procesar suscripciones, pagos y autenticación de cuenta.",
          "Importar y sincronizar datos desde integraciones autorizadas por ti.",
          "Brindar soporte, responder solicitudes y enviar mensajes relacionados con el servicio.",
          "Mejorar y mantener el Servicio, incluyendo depuración, monitoreo y analítica.",
          "Hacer cumplir nuestros Términos de Servicio, prevenir fraude y proteger la seguridad del Servicio.",
        ],
      },
      {
        title: "4. Business AI Coaching y procesamiento automatizado",
        body:
          "Si usas funciones de Business AI Coaching, NTJ puede procesar tus datos de empresa de trading, registros de ejecución, notas, planes, screenshots, data importada del broker, analítica y contexto relacionado mediante OpenAI u otros proveedores de IA para generar resúmenes, insights, simulaciones y sugerencias educativas. Las salidas del Business AI Coaching dependen de la data que proveas o importes. Eres responsable de asegurar que tus inputs sean precisos y completos. El Business AI Coaching puede generar resultados inexactos, incompletos, desactualizados o engañosos. Debes evaluar cualquier salida antes de tomar decisiones.",
      },
      {
        title: "4.1 Uso educativo y no asesoría",
        body:
          "La analítica, proyecciones, simulaciones, Business AI Coaching, Neuro Analysis, Option Flow Intelligence, dashboards, reportes y salidas similares se ofrecen únicamente con fines educativos, de journaling, investigación, simulación y accountability empresarial. No constituyen asesoría financiera, de inversión, trading, legal, contributiva ni contable; no recomiendan comprar, vender, mantener u operar ningún instrumento; y no garantizan ganancias, ingresos, crecimiento de capital, mejora en rendimiento de trading ni ningún resultado específico.",
      },
      {
        title: "5. Cómo compartimos la información",
        bullets: [
          "No vendemos tu información personal.",
          "Proveedores de servicio: con terceros que nos ayudan a operar el Servicio bajo acuerdos contractuales, incluyendo hosting, base de datos, autenticación, almacenamiento, procesamiento de pagos, procesamiento de IA, email, soporte, seguridad, distribución de apps, monitoreo y analítica.",
          "Integraciones que habilitas: con plataformas de terceros cuando decides conectarlas (el flujo de datos se basa en tu autorización).",
          "Legal y seguridad: para cumplir con la ley, órdenes judiciales o solicitudes de autoridades, o para proteger los derechos, seguridad y protección de NTJ, nuestros usuarios u otros.",
          "Transferencias de negocio: en conexión con una fusión, adquisición, financiamiento, reorganización, bancarrota o venta de activos (sujeto a la ley aplicable).",
          "Funciones públicas (opcionales): si eliges compartir trades, resúmenes u otro contenido públicamente, dicho contenido puede ser visible según tu configuración.",
        ],
      },
      {
        title: "5.1 Proveedores actuales y cuentas API",
        bullets: [
          "Supabase puede usarse para autenticación, base de datos, almacenamiento y servicios backend.",
          "Vercel puede usarse para hosting, funciones serverless, despliegue y logs operativos.",
          "Stripe puede usarse para suscripciones, checkout, facturación, invoices, taxes y registros de cliente relacionados con pagos.",
          "OpenAI u otros proveedores de IA pueden usarse para generar coaching con IA, resúmenes, análisis y respuestas de soporte basadas en los datos que envías o autorizas.",
          "Expo, Apple y Google pueden usarse para builds móviles, distribución de apps, notificaciones push, servicios de dispositivo y operaciones de tiendas.",
          "Proveedores de email, seguridad, analítica, soporte y prevención de abuso como Resend, hCaptcha y proveedores similares pueden procesar datos limitados necesarios para operar esas funciones.",
        ],
      },
      {
        title: "5.2 Integraciones de broker; actualmente deshabilitadas hasta aprobación",
        body:
          "Las integraciones directas de broker, incluyendo SnapTrade y Webull, están pensadas para permanecer deshabilitadas hasta completar aprobaciones de proveedores y preparación de producción. Si luego habilitas una conexión de broker, NTJ y sus proveedores de servicio pueden intercambiar datos con ese broker o proveedor de conexión según tu autorización. Esto puede incluir identificadores de cuenta, balances, holdings, posiciones, órdenes, actividades, transacciones, fills, fees, comisiones, timestamps, tokens OAuth o metadata de autorización, y logs de sincronización. Las conexiones de broker están diseñadas para importar, sincronizar, mostrar, auditar y analizar tu data de trading; NTJ no las usa para colocar trades, retirar fondos ni custodiar activos. Puedes desconectar integraciones soportadas cuando el Servicio provea esa opción o contactar soporte para solicitudes de eliminación.",
      },
      {
        title: "6. Cookies y analítica",
        body:
          "Podemos usar cookies y tecnologías similares para mantener tu sesión, recordar preferencias y entender el uso del Servicio. Podemos usar proveedores de analítica para recopilar información estadística (IP, dispositivo/navegador, eventos de uso). Esta analítica se usa para mejorar el Servicio y no busca identificarte más allá de lo necesario para operar.",
      },
      {
        title: "7. Retención de datos",
        body:
          "Retenemos información el tiempo necesario para prestar el Servicio, cumplir obligaciones legales, resolver disputas y hacer cumplir acuerdos. Los periodos de retención pueden variar según el tipo de información y su uso.",
      },
      {
        title: "8. Seguridad",
        body:
          "Implementamos salvaguardas administrativas, técnicas y físicas razonables para proteger la información. Sin embargo, ningún sistema es impenetrable. Eres responsable de usar una contraseña fuerte y proteger tus credenciales.",
      },
      {
        title: "9. Tus opciones y derechos",
        body:
          "Dependiendo de tu ubicación, puedes tener derechos para acceder, corregir, eliminar o exportar cierta información, y para objetar o restringir ciertos tratamientos. También puedes darte de baja de comunicaciones de marketing no esenciales, desconectar integraciones soportadas y solicitar eliminación de data importada del broker o data de cuenta cuando la ley lo requiera. Para solicitar acciones, contáctanos en support@neurotrader-journal.com.",
      },
      {
        title: "10. Transferencias internacionales",
        body:
          "Si accedes al Servicio desde fuera del país donde están nuestros servidores o proveedores, tu información puede ser transferida y procesada en esos lugares. Tomamos medidas para asegurar que dichas transferencias cumplan con la ley aplicable.",
      },
      {
        title: "11. Privacidad de menores",
        body:
          "El Servicio no está dirigido a menores y no está destinado a personas menores de 18 años. No recopilamos conscientemente información personal de menores. Si crees que un menor ha proporcionado información personal, contáctanos en support@neurotrader-journal.com.",
      },
      {
        title: "12. Cambios a esta política",
        body:
          "Podemos actualizar esta Política de Privacidad. La versión actualizada será efectiva cuando se publique o se haga disponible. Para cambios materiales, podemos requerir que marques una casilla de aceptación antes de continuar usando funciones privadas o completar checkout.",
      },
      {
        title: "13. Contacto",
        body:
          "Para preguntas o solicitudes sobre esta Política de Privacidad, contáctanos en: support@neurotrader-journal.com.",
      },
    ],
  },
};

export default function PrivacyPolicyPage() {
  const { theme, locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isLight = theme === "light";
  const isEs = lang === "es";
  const content = isEs ? CONTENT.es : CONTENT.en;

  return (
    <main className={isLight ? "min-h-screen bg-slate-50 text-slate-900" : "min-h-screen bg-slate-950 text-slate-50"}>
      <div className="fixed left-6 top-10 z-20 hidden xl:block">
        <PublicHomeLogoLink size="lg" showLabel={false} />
      </div>
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 space-y-10">
        <div className="xl:hidden">
          <PublicHomeLogoLink size="md" showLabel={false} />
        </div>
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">
              {isEs ? "Privacidad" : "Privacy"}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold">
              {isEs ? "Política de Privacidad" : "Privacy Policy"}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              {isEs
                ? "Última actualización: 3 de septiembre de 2026."
                : "Last updated: September 3, 2026."}
            </p>
          </div>

          <p className="text-sm text-slate-400 max-w-3xl">{content.intro}</p>

          <div className="flex flex-wrap gap-3 text-[11px]">
            <Link href="/terms" className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-emerald-400 hover:text-emerald-200">
              {isEs ? "Términos y Condiciones" : "Terms & Conditions"}
            </Link>
            <Link href="/contact" className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-emerald-400 hover:text-emerald-200">
              {isEs ? "Contactar soporte" : "Contact support"}
            </Link>
          </div>
        </header>

        <section className="space-y-6">
          {content.sections.map((section) => (
            <div
              key={section.title}
              className={isLight ? "rounded-2xl border border-slate-200 bg-white p-5" : "rounded-2xl border border-slate-800 bg-slate-900/70 p-5"}
            >
              <h2 className="text-lg font-semibold text-slate-100">{section.title}</h2>
              {section.body && (
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">{section.body}</p>
              )}
              {section.bullets && (
                <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc pl-5">
                  {section.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
