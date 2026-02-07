"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

const CONTENT = {
  en: {
    intro:
      "This Privacy Policy explains how Neuro Trader Journal (\"NTJ\", \"we\", \"us\", or \"our\"), operated by SG PAX CORP., collects, uses, shares, and protects information in connection with the Neuro Trader Journal website, applications, and related services (collectively, the \"Service\").",
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
          "Trading Journal Data: trade records, fills, timestamps, instrument details, commissions/fees, screenshots, notes, tags, and related analytics inputs.",
          "Integration Data: information you authorize us to import from third-party platforms (for example, broker/platform trade history).",
          "Usage Data: log data and analytics about how you use the Service (e.g., pages viewed, features used, device/browser information, IP address).",
          "Support Communications: messages and attachments you send to our support team.",
          "Payment Information: billing details processed by our payment processor (we typically do not store full card numbers).",
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
        title: "4. AI Coaching and Automated Processing",
        body:
          "If you use AI Coaching features, NTJ may process your trading journal data, notes, and related context to generate summaries, insights, and suggestions. AI Coaching outputs depend on the data you provide or import. You are responsible for ensuring your inputs are accurate and complete. AI Coaching may produce inaccurate, incomplete, or misleading output. You should independently evaluate any AI Coaching output before relying on it.",
      },
      {
        title: "5. How We Share Information",
        bullets: [
          "We do not sell your personal information.",
          "Service Providers: with vendors who help us operate the Service (e.g., hosting, analytics, customer support, payment processing) under contractual obligations.",
          "Integrations You Enable: with third-party platforms when you choose to connect them (data flows may occur between NTJ and the third party based on your authorization).",
          "Legal and Safety: to comply with law, court orders, or requests by public authorities, or to protect the rights, safety, and security of NTJ, our users, or others.",
          "Business Transfers: in connection with a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets (subject to applicable law).",
          "Public Sharing Features (Optional): if you choose to share trades, summaries, or other content publicly, that content may be visible to others based on your settings.",
        ],
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
          "Depending on your location, you may have rights to access, correct, delete, or export certain information, and to object to or restrict certain processing. You may also opt out of non-essential marketing communications. To request action, contact us at support@neurotrader-journal.com.",
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
          "We may update this Privacy Policy from time to time. The updated version will be effective when posted or otherwise made available to you. Your continued use of the Service after an update constitutes acceptance of the updated Privacy Policy.",
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
      "Esta Política de Privacidad explica cómo Neuro Trader Journal (\"NTJ\", \"nosotros\", \"nos\" o \"nuestro\"), operado por SG PAX CORP., recopila, utiliza, comparte y protege la información en relación con el sitio web, las aplicaciones y los servicios relacionados de Neuro Trader Journal (colectivamente, el \"Servicio\").",
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
          "Datos del journal de trading: registros de operaciones, fills, timestamps, detalles del instrumento, comisiones/tarifas, screenshots, notas, etiquetas y entradas relacionadas con analítica.",
          "Datos de integraciones: información que autorizas a importar desde plataformas de terceros (por ejemplo, historial de trading del broker/plataforma).",
          "Datos de uso: logs y analítica sobre cómo usas el Servicio (páginas vistas, funciones utilizadas, información del dispositivo/navegador, dirección IP).",
          "Comunicaciones de soporte: mensajes y adjuntos enviados a nuestro equipo de soporte.",
          "Información de pagos: datos de facturación procesados por nuestro proveedor de pagos (normalmente no almacenamos números completos de tarjeta).",
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
        title: "4. AI Coaching y procesamiento automatizado",
        body:
          "Si usas funciones de AI Coaching, NTJ puede procesar tus datos del journal, notas y contexto relacionado para generar resúmenes, insights y sugerencias. Las salidas del AI Coaching dependen de la data que proveas o importes. Eres responsable de asegurar que tus inputs sean precisos y completos. El AI Coaching puede generar resultados inexactos, incompletos o engañosos. Debes evaluar cualquier salida antes de tomar decisiones.",
      },
      {
        title: "5. Cómo compartimos la información",
        bullets: [
          "No vendemos tu información personal.",
          "Proveedores de servicio: con terceros que nos ayudan a operar el Servicio (hosting, analítica, soporte, procesamiento de pagos) bajo acuerdos contractuales.",
          "Integraciones que habilitas: con plataformas de terceros cuando decides conectarlas (el flujo de datos se basa en tu autorización).",
          "Legal y seguridad: para cumplir con la ley, órdenes judiciales o solicitudes de autoridades, o para proteger los derechos, seguridad y protección de NTJ, nuestros usuarios u otros.",
          "Transferencias de negocio: en conexión con una fusión, adquisición, financiamiento, reorganización, bancarrota o venta de activos (sujeto a la ley aplicable).",
          "Funciones públicas (opcionales): si eliges compartir trades, resúmenes u otro contenido públicamente, dicho contenido puede ser visible según tu configuración.",
        ],
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
          "Dependiendo de tu ubicación, puedes tener derechos para acceder, corregir, eliminar o exportar cierta información, y para objetar o restringir ciertos tratamientos. También puedes darte de baja de comunicaciones de marketing no esenciales. Para solicitar acciones, contáctanos en support@neurotrader-journal.com.",
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
          "Podemos actualizar esta Política de Privacidad. La versión actualizada será efectiva cuando se publique o se haga disponible. El uso continuo del Servicio tras una actualización constituye aceptación de la política actualizada.",
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
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 space-y-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/neurotrader-logo.svg" alt="Neuro Trader" className="h-28 md:h-32 w-auto" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">
                {isEs ? "Privacidad" : "Privacy"}
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold">
                {isEs ? "Política de Privacidad" : "Privacy Policy"}
              </h1>
              <p className="text-sm text-slate-400 mt-2">
                {isEs
                  ? "Última actualización: 7 de febrero de 2026."
                  : "Last updated: February 7, 2026."}
              </p>
            </div>
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
