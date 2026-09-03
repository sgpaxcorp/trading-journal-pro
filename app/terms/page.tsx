"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import PublicHomeLogoLink from "@/app/components/PublicHomeLogoLink";

const CONTENT = {
  en: {
    title: "Terms & Conditions",
    updated: "Effective Date: September 3, 2026",
    intro:
      "These Terms of Service (\"Terms\") govern your access to and use of the Neuro Trader website, applications, and related services (collectively, the \"Service\") provided by SG PAX CORP. (\"Neuro Trader\", \"NTJ\", \"we\", \"us\", or \"our\").",
    important:
      "IMPORTANT: NTJ is a trading business organization, analytics, simulation, and educational/coaching platform. NTJ is not a broker-dealer, investment adviser, commodity trading advisor, financial planner, law firm, tax adviser, or accounting firm. Nothing in the Service is intended to be (or should be construed as) investment, trading, legal, tax, accounting, or other professional advice. NTJ does not guarantee profits, income, capital growth, improved trading performance, or any specific financial result.",
    sections: [
      {
        title: "1. Acceptance of Terms",
        body:
          "BY ACCESSING OR USING THE SERVICE, CREATING AN ACCOUNT, CHECKING AN ACCEPTANCE BOX, OR COMPLETING CHECKOUT, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT ACCESS OR USE THE SERVICE. We may update these Terms from time to time. For material updates, we may require you to affirmatively accept the updated Terms and/or Privacy Policy before continuing to use private features or completing a new checkout.",
      },
      {
        title: "2. Description of the Service",
        body:
          "The Service may include features such as execution records, trading business plans, trade analytics, performance metrics, tagging and notes, screenshots and attachments, dashboards, integrations with third-party platforms, community or sharing features (if enabled), Neuro Analysis, Option Flow Intelligence, and AI-assisted coaching and insights. The Service is designed for educational learning, journaling, analysis, simulation, operational accountability, and business-performance review. It is not designed to execute trades for you or replace independent judgment or licensed professional advice. We may add, remove, or modify features at any time. You are responsible for obtaining and maintaining all devices, software, and internet access necessary to use the Service.",
      },
      {
        title: "3. Eligibility and Account Registration",
        body:
          "You must be legally able to enter into a binding contract in your jurisdiction to use the Service. You agree to provide accurate, current, and complete information when creating an account and to keep that information updated. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. Notify us immediately at support@neurotrader-journal.com if you suspect unauthorized access or use.",
      },
      {
        title: "4. Data Inputs, Integrations, and User Responsibility",
        body:
          "The accuracy and usefulness of execution records, analytics, metrics, and Business AI Coaching outputs depend on the quality and completeness of the data you provide and/or authorize NTJ to import through integrations. You are solely responsible for: (1) entering, uploading, or importing your trading data correctly and completely; (2) reviewing imported data for accuracy (including fills, commissions, fees, timestamps, and instrument details); (3) confirming that your broker, prop firm, or third-party platform data is accurate and reflects your official records; and (4) understanding how your broker/platform calculates metrics (e.g., realized vs. unrealized PnL, net vs. gross PnL). You acknowledge that third-party integrations may be unavailable, delayed, incomplete, or inaccurate due to third-party systems, permissions, API changes, outages, or other causes outside our control.",
      },
      {
        title: "4.1 Rights to Third-Party Data and Connected Accounts",
        body:
          "You represent and warrant that you have all rights, permissions, consents, and authority necessary to enter, upload, import, display, transmit, or authorize NTJ to access any third-party content or data you provide through the Service. This includes broker or platform statements, trade history, order history, account data, screenshots, reports, attachments, market or news materials, and any content that belongs to another person, company, broker, exchange, data provider, prop firm, platform, or service. If you connect a third-party account, you authorize NTJ and its service providers to access and process the requested data solely to provide the Service. You must comply with all applicable third-party terms and may not upload, import, or share data or content that you are not permitted to use.",
      },
      {
        title: "5. Business AI Coaching and AI-Assisted Insights",
        body:
          "The Service may provide AI-assisted coaching, pattern detection, summaries, evaluations, simulations, trade reviews, risk/mindset prompts, and other automated insights (\"Business AI Coaching\"). Business AI Coaching is provided for informational, educational, journaling, simulation, and accountability purposes only. It is not a promise that your trading plan will work or that your behavior, profitability, income, account balance, or capital will improve.",
      },
      {
        title: "5.1 AI May Be Inaccurate or Incomplete",
        body:
          "Business AI Coaching outputs are generated by automated systems and may contain errors, omissions, hallucinations, incorrect assumptions, outdated information, or analysis that does not fit your circumstances. We do not guarantee the accuracy, completeness, reliability, consistency, usefulness, or availability of any Business AI Coaching output.",
      },
      {
        title: "5.2 AI Relies on Your Data and Context",
        body:
          "Business AI Coaching analyzes information based on the data you enter, upload, import, or otherwise provide (including trade data, notes, tags, and preferences). Because Business AI Coaching depends on your inputs, you are responsible for ensuring that your data is accurate and complete. Incorrect or incomplete inputs may produce misleading outputs.",
      },
      {
        title: "5.3 No Financial Advice; You Must Independently Evaluate",
        body:
          "Business AI Coaching, Neuro Analysis, Option Flow Intelligence, dashboards, reports, analytics, simulations, projections, alerts, and educational materials are not investment advice, trading advice, financial planning, portfolio management, or a recommendation to buy, sell, hold, allocate capital to, avoid, or trade any security, derivative, option, futures contract, forex pair, cryptocurrency, or any other instrument. Any actions you take after using the Service are taken at your sole discretion and risk. You must independently evaluate any suggestion, recommendation, scenario, simulation, projection, or analysis and decide whether to act.",
      },
      {
        title: "5.4 Assumption of Risk",
        body:
          "You assume all risks associated with relying on or using Business AI Coaching, including the risk of trading losses, missed opportunities, or adverse outcomes. NTJ disclaims all liability for decisions made based on Business AI Coaching.",
      },
      {
        title: "5.5 No Guaranteed Outcomes",
        body:
          "NTJ does not guarantee that the Service, Business AI Coaching, Neuro Analysis, Option Flow Intelligence, any trading business plan, any projection, any simulation, any alert, or any report will increase income, maximize capital, protect capital, prevent losses, improve discipline, improve performance, identify profitable trades, or produce any financial, trading, educational, or business result. Any examples, scenarios, targets, projections, or simulated returns are hypothetical and educational only.",
      },
      {
        title: "6. Trading Risk Disclosure",
        body:
          "Trading and investing involve substantial risk and are not suitable for all individuals. You can lose some or all of your capital, and losses may exceed deposits when leverage, options, futures, margin, or similar products are used. Past performance, back-tested results, hypothetical examples, simulated results, screenshots, community results, or platform analytics are not indicative of future results. You are solely responsible for determining whether any trading strategy, instrument, product, risk level, or approach is appropriate for you.",
      },
      {
        title: "6.1 Trading Business Plan Projections and Discipline",
        body:
          "The Trading Business Plan is an educational business-planning and discipline tool. Its projections, target-compound paths, conditional hit rates, scenario comparisons, checkpoints, statistical simulations, and AI explanations are based on the data and assumptions you provide. They are conditional planning outputs, not forecasts, guarantees of profit, promises that a target will be reached, or individualized investment, trading, legal, tax, or accounting advice. Actual results may differ materially because of execution, market conditions, liquidity, volatility, slippage, commissions and fees, leverage, deposits, withdrawals, taxes, outages, and incomplete or inaccurate data. Activating a plan is a commitment to a disciplined operating process, risk controls, accurate records, and regular projected-versus-actual review; it is not a commitment to produce or pursue a promised return. You remain solely responsible for independent decisions, risk limits, compliance with broker and market rules, and consultation with appropriately licensed professionals when needed.",
      },
      {
        title: "7. User Conduct",
        body:
          "You agree not to use the Service to violate any applicable law or regulation; infringe intellectual property, privacy, publicity, or other rights; upload malware or attempt to disrupt, damage, or gain unauthorized access; harass, abuse, defame, or discriminate; misrepresent your identity or affiliation; or use the Service for unauthorized commercial solicitation or spam. We may investigate and take any action we deem appropriate, including removing content, suspending accounts, or terminating access, to enforce these Terms.",
      },
      {
        title: "8. User Content and Permissions",
        body:
          "You retain ownership of the content you submit to the Service (including trade data, notes, images, attachments, and other materials) (\"User Content\"). You grant NTJ a non-exclusive, worldwide, royalty-free license to host, store, process, reproduce, and display User Content as necessary to operate, improve, and provide the Service. If the Service offers sharing/public features and you choose to share User Content publicly, you understand that other users may view or access that content. You are responsible for ensuring that your User Content does not contain confidential information you are not authorized to share.",
      },
      {
        title: "9. Subscriptions, Billing, and Cancellations",
        body:
          "Certain features may require a paid subscription, paid add-on, or other paid access. Eligible first-time accounts may receive a five (5) day free trial if shown at checkout. By starting a trial, entering a payment method, and checking the checkout acceptance box, you authorize us and our payment processor to automatically charge the selected plan after the trial ends unless you cancel before the trial ends. Trial eligibility is not guaranteed, is generally limited to one trial per user/customer/payment method, and may be denied or revoked for abuse. Fees are billed in advance on a recurring prepaid basis (monthly or annually) unless otherwise stated at checkout. You may cancel your subscription at any time. Cancellation stops future renewals; your access remains available through the end of the current paid period and is suspended after that period ends unless renewed. Refunds: All purchases are final after successful payment. Except where required by law or explicitly stated in writing by NTJ, subscription fees, add-on fees, trial-conversion charges, renewal charges, annual payments, partial billing periods, unused access, downgrades, cancellations after renewal, and purchases made by mistake are non-refundable. You are responsible for canceling before a trial converts or before a renewal occurs to avoid additional charges.",
      },
      {
        title: "10. Third-Party Services and Links",
        body:
          "The Service may integrate with, rely on, or link to third-party services, including hosting, database, authentication, storage, payment processing, AI processing, email, security, app distribution, analytics, broker, market-data, charting, and support providers. These may include NTJ-controlled provider accounts such as Stripe, Supabase, Vercel, OpenAI or other AI providers, Expo, Apple, Google, Resend, hCaptcha, and similar vendors, and, if enabled in the future, broker connectivity providers such as SnapTrade or Webull. Third-party services are not under our control. We do not endorse and are not responsible for third-party services, including their availability, accuracy, security, terms, or privacy practices.",
      },
      {
        title: "10.1 Broker Integrations; SnapTrade and Webull",
        body:
          "Direct broker sync, including SnapTrade and Webull integrations, may be disabled, limited, in beta, or subject to provider approval before public availability. While direct broker sync is disabled, you should use manual broker statement, order-history, CSV, or XLSX imports where available. If direct broker sync is enabled, broker connections are intended to be read-only unless we clearly disclose otherwise. NTJ does not place trades, route orders, withdraw funds, custody assets, manage brokerage accounts, or guarantee that broker data will be complete, current, or accurate. You authorize NTJ and its service providers to request, receive, store, process, and display broker data needed for the Service, which may include account identifiers, account profile data, balances, holdings, positions, orders, activities, transactions, fills, fees, commissions, timestamps, and related metadata. You are responsible for maintaining your broker relationship and complying with your broker's terms.",
      },
      {
        title: "10.2 Third-Party Names, Logos, and Trademarks",
        body:
          "Third-party names, logos, broker names, platform names, trademarks, screenshots, statements, and other materials are owned by their respective owners. Any references in the Service are for identification, compatibility, data-import, or descriptive purposes only and do not imply sponsorship, endorsement, partnership, or affiliation unless expressly stated in writing. You may not use the Service to copy, upload, display, or distribute third-party content, logos, data, or marks unless you have the necessary rights or are otherwise legally permitted to do so.",
      },
      {
        title: "11. Intellectual Property",
        body:
          "The Service, including its software, design, logos, trademarks, and content provided by NTJ (excluding User Content), is owned by NTJ and/or its licensors and is protected by applicable intellectual property laws. Subject to your compliance with these Terms, NTJ grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your personal or internal business use.",
      },
      {
        title: "12. Disclaimers",
        body:
          "THE SERVICE (INCLUDING BUSINESS AI COACHING, NEURO ANALYSIS, OPTION FLOW INTELLIGENCE, ANALYTICS, PROJECTIONS, SIMULATIONS, REPORTS, AND ALERTS) IS PROVIDED ON AN \"AS IS\" AND \"AS AVAILABLE\" BASIS. TO THE MAXIMUM EXTENT PERMITTED BY LAW, NTJ DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT ANY DATA, RESULTS, METRICS, PNL, AI OUTPUTS, PROJECTIONS, SIMULATIONS, OR REPORTS WILL BE ACCURATE, RELIABLE, COMPLETE, CONSISTENT, OR SUITABLE FOR YOUR PURPOSES.",
      },
      {
        title: "13. Limitation of Liability",
        body:
          "TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL NTJ OR ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF (OR INABILITY TO USE) THE SERVICE, INCLUDING ANY RELIANCE ON BUSINESS AI COACHING. TO THE MAXIMUM EXTENT PERMITTED BY LAW, NTJ'S TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID TO NTJ FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.",
      },
      {
        title: "14. Indemnification",
        body:
          "You agree to defend, indemnify, and hold harmless NTJ and its Affiliates from and against any claims, damages, liabilities, losses, and expenses (including reasonable attorneys' fees) arising out of or related to your use of the Service, your User Content, your violation of these Terms, or your violation of any rights of another.",
      },
      {
        title: "15. Termination",
        body:
          "We may suspend or terminate your access to the Service at any time, with or without notice, if we reasonably believe you have violated these Terms or if we must do so to comply with law, protect the Service, or prevent harm. You may stop using the Service at any time. Upon termination, your right to use the Service will cease. Certain provisions of these Terms by their nature should survive termination, including intellectual property, disclaimers, limitation of liability, indemnification, and governing law.",
      },
      {
        title: "16. Governing Law and Dispute Resolution",
        body:
          "These Terms are governed by the laws of the jurisdiction in which NTJ is established, without regard to conflict-of-law principles. You agree that any dispute arising out of or relating to these Terms or the Service will be brought in the courts of competent jurisdiction in that location, unless applicable law provides otherwise.",
      },
      {
        title: "17. Notices",
        body:
          "We may provide notices to you via the Service, email, or other reasonable means. Notices to NTJ must be sent by email to support@neurotrader-journal.com.",
      },
      {
        title: "18. Miscellaneous",
        body:
          "Entire Agreement: These Terms constitute the entire agreement between you and NTJ regarding the Service. Severability: If any provision is held unenforceable, the remaining provisions will remain in effect. No Waiver: Failure to enforce any right or provision is not a waiver of such right or provision. Assignment: You may not assign your rights or obligations under these Terms without our consent; we may assign our rights and obligations. Force Majeure: We are not liable for delays or failures due to events beyond our reasonable control.",
      },
      {
        title: "19. Contact",
        body:
          "If you have questions about these Terms or wish to report a violation, contact: support@neurotrader-journal.com.",
      },
    ],
  },
  es: {
    title: "Términos y Condiciones",
    updated: "Fecha de vigencia: 3 de septiembre de 2026",
    intro:
      "Estos Términos de Servicio (los \"Términos\") rigen tu acceso y uso del sitio web, las aplicaciones y los servicios relacionados de Neuro Trader (colectivamente, el \"Servicio\") provistos por SG PAX CORP. (\"Neuro Trader\", \"NTJ\", \"nosotros\", \"nos\" o \"nuestro\").",
    important:
      "IMPORTANTE: NTJ es una plataforma de organización empresarial de trading, analítica, simulación y educación/coaching. NTJ no es broker-dealer, asesor de inversiones, asesor de trading de commodities, planificador financiero, bufete de abogados, asesor contributivo ni firma contable. Nada en el Servicio pretende ser (ni debe interpretarse como) asesoría de inversión, trading, legal, contributiva, contable u otra asesoría profesional. NTJ no garantiza ganancias, ingresos, crecimiento de capital, mejora de rendimiento de trading ni ningún resultado financiero específico.",
    sections: [
      {
        title: "1. Aceptación de los Términos",
        body:
          "AL ACCEDER O UTILIZAR EL SERVICIO, CREAR UNA CUENTA, MARCAR UNA CASILLA DE ACEPTACIÓN O COMPLETAR CHECKOUT, ACEPTAS QUEDAR VINCULADO POR ESTOS TÉRMINOS. SI NO ESTÁS DE ACUERDO, NO ACCEDAS NI UTILICES EL SERVICIO. Podemos actualizar estos Términos periódicamente. Para cambios materiales, podemos requerir que aceptes afirmativamente los Términos y/o la Política de Privacidad actualizados antes de continuar usando funciones privadas o completar un nuevo checkout.",
      },
      {
        title: "2. Descripción del Servicio",
        body:
          "El Servicio puede incluir funciones como registros de ejecución, planes de empresa de trading, analítica de trading, métricas de rendimiento, etiquetas y notas, screenshots y adjuntos, dashboards, integraciones con plataformas de terceros, funciones comunitarias o de compartición (si están habilitadas), Neuro Analysis, Option Flow Intelligence, y coaching e insights con IA. El Servicio está diseñado para aprendizaje educativo, journaling, análisis, simulación, accountability operativo y revisión de rendimiento empresarial. No está diseñado para ejecutar operaciones por ti ni para reemplazar tu juicio independiente o asesoría profesional autorizada. Podemos añadir, eliminar o modificar funciones en cualquier momento. Eres responsable de obtener y mantener todos los dispositivos, software y acceso a internet necesarios para usar el Servicio.",
      },
      {
        title: "3. Elegibilidad y registro de cuenta",
        body:
          "Debes tener capacidad legal para celebrar un contrato vinculante en tu jurisdicción para usar el Servicio. Aceptas proporcionar información precisa, actual y completa al crear una cuenta y mantenerla actualizada. Eres responsable de mantener la confidencialidad de tus credenciales y de toda actividad bajo tu cuenta. Notifícanos de inmediato en support@neurotrader-journal.com si sospechas acceso no autorizado.",
      },
      {
        title: "4. Inputs de datos, integraciones y responsabilidad del usuario",
        body:
          "La precisión y utilidad de los registros de ejecución, analítica, métricas y outputs del Business AI Coaching dependen de la calidad y completitud de los datos que proporcionas y/o autorizas a NTJ a importar mediante integraciones. Eres exclusivamente responsable de: (1) ingresar, subir o importar tu data de trading de forma correcta y completa; (2) revisar la data importada para asegurar exactitud (fills, comisiones, fees, timestamps, detalles del instrumento); (3) confirmar que la data de tu broker, prop firm o plataforma es precisa y coincide con tus registros oficiales; y (4) entender cómo tu broker/plataforma calcula métricas (por ejemplo, PnL realizado vs. no realizado, PnL neto vs. bruto). Reconoces que las integraciones de terceros pueden estar no disponibles, retrasadas, incompletas o inexactas por causas fuera de nuestro control.",
      },
      {
        title: "4.1 Derechos sobre datos de terceros y cuentas conectadas",
        body:
          "Declaras y garantizas que tienes todos los derechos, permisos, consentimientos y autoridad necesarios para ingresar, subir, importar, mostrar, transmitir o autorizar a NTJ a acceder cualquier contenido o dato de terceros que proporciones mediante el Servicio. Esto incluye statements de broker o plataforma, historial de trades, historial de órdenes, datos de cuenta, screenshots, reportes, adjuntos, materiales de mercado o noticias, y cualquier contenido que pertenezca a otra persona, compañía, broker, exchange, proveedor de datos, prop firm, plataforma o servicio. Si conectas una cuenta de terceros, autorizas a NTJ y a sus proveedores de servicio a acceder y procesar los datos solicitados únicamente para proveer el Servicio. Debes cumplir con los términos aplicables de cada tercero y no puedes subir, importar ni compartir datos o contenido que no estés autorizado a usar.",
      },
      {
        title: "5. Business AI Coaching e insights asistidos por IA",
        body:
          "El Servicio puede proporcionar coaching con IA, detección de patrones, resúmenes, evaluaciones, simulaciones, revisiones de trades, prompts de riesgo/mindset y otros insights automatizados (\"Business AI Coaching\"). Business AI Coaching se brinda únicamente con fines informativos, educativos, de journaling, simulación y accountability. No es una promesa de que tu plan de trading funcionará ni de que mejorará tu conducta, rentabilidad, ingreso, balance de cuenta o capital.",
      },
      {
        title: "5.1 La IA puede ser inexacta o incompleta",
        body:
          "Los outputs del Business AI Coaching son generados por sistemas automáticos y pueden contener errores, omisiones, alucinaciones, supuestos incorrectos, información desactualizada o análisis que no se ajuste a tus circunstancias. No garantizamos la exactitud, completitud, confiabilidad, consistencia, utilidad ni disponibilidad de ningún output del Business AI Coaching.",
      },
      {
        title: "5.2 La IA depende de tus datos y contexto",
        body:
          "Business AI Coaching analiza información basada en los datos que ingresas, subes, importas o proporcionas (incluyendo data de trading, notas, etiquetas y preferencias). Como depende de tus inputs, eres responsable de que sean precisos y completos. Inputs incorrectos pueden generar outputs engañosos.",
      },
      {
        title: "5.3 Sin asesoría financiera; debes evaluar por tu cuenta",
        body:
          "Business AI Coaching, Neuro Analysis, Option Flow Intelligence, dashboards, reportes, analítica, simulaciones, proyecciones, alertas y materiales educativos no son asesoría de inversión, asesoría de trading, planificación financiera, manejo de portafolio ni recomendación para comprar, vender, mantener, asignar capital, evitar u operar ningún valor, derivado, opción, contrato de futuros, par de forex, criptomoneda u otro instrumento. Cualquier acción que tomes después de usar el Servicio es bajo tu propio criterio y riesgo. Debes evaluar de forma independiente cualquier sugerencia, recomendación, escenario, simulación, proyección o análisis antes de actuar.",
      },
      {
        title: "5.4 Asunción de riesgo",
        body:
          "Asumes todos los riesgos asociados a usar o confiar en Business AI Coaching, incluyendo pérdidas, oportunidades perdidas o resultados adversos. NTJ no asume responsabilidad por decisiones tomadas con base en Business AI Coaching.",
      },
      {
        title: "5.5 Sin resultados garantizados",
        body:
          "NTJ no garantiza que el Servicio, Business AI Coaching, Neuro Analysis, Option Flow Intelligence, cualquier Plan de Empresa de Trading, proyección, simulación, alerta o reporte aumente ingresos, maximice capital, proteja capital, prevenga pérdidas, mejore disciplina, mejore rendimiento, identifique trades rentables o produzca algún resultado financiero, de trading, educativo o empresarial. Cualquier ejemplo, escenario, meta, proyección o retorno simulado es hipotético y educativo.",
      },
      {
        title: "6. Divulgación de riesgo de trading",
        body:
          "El trading y la inversión implican riesgo sustancial y no son adecuados para todos. Puedes perder parte o la totalidad de tu capital, y las pérdidas pueden exceder los depósitos cuando se usa apalancamiento, opciones, futuros, margen o productos similares. El rendimiento pasado, resultados de back-testing, ejemplos hipotéticos, resultados simulados, screenshots, resultados de comunidad o analítica de la plataforma no son indicativos de resultados futuros. Eres el único responsable de determinar si una estrategia, instrumento, producto, nivel de riesgo o enfoque es apropiado para ti.",
      },
      {
        title: "6.1 Proyecciones y disciplina del Plan de Empresa de Trading",
        body:
          "El Plan de Empresa de Trading es una herramienta educativa de planificación empresarial y disciplina. Sus proyecciones, trayectorias compuestas de metas, tasas condicionales de llegada, comparaciones de escenarios, checkpoints, simulaciones estadísticas y explicaciones de IA se basan en los datos y supuestos que proporcionas. Son resultados condicionales de planificación, no pronósticos, garantías de ganancias, promesas de alcanzar una meta ni asesoría individualizada de inversión, trading, legal, contributiva o contable. Los resultados reales pueden diferir sustancialmente por ejecución, condiciones de mercado, liquidez, volatilidad, slippage, comisiones y costos, apalancamiento, aportaciones, retiros, contribuciones, interrupciones y datos incompletos o inexactos. Activar un plan es comprometerse con un proceso operativo disciplinado, controles de riesgo, registros precisos y revisión periódica de proyectado versus real; no es comprometerse a producir o perseguir un retorno prometido. Sigues siendo responsable de las decisiones independientes, límites de riesgo, cumplimiento de las reglas del broker y del mercado, y consulta con profesionales debidamente autorizados cuando sea necesario.",
      },
      {
        title: "7. Conducta del usuario",
        body:
          "Aceptas no usar el Servicio para: violar leyes o regulaciones; infringir propiedad intelectual o privacidad; subir malware o intentar acceder de forma no autorizada; acosar o discriminar; suplantar identidad; o usar el Servicio para spam o solicitación comercial no autorizada. Podemos investigar y tomar medidas, incluyendo eliminar contenido, suspender cuentas o terminar acceso para hacer cumplir estos Términos.",
      },
      {
        title: "8. Contenido del usuario y permisos",
        body:
          "Conservas la propiedad del contenido que envías al Servicio (data de trades, notas, imágenes, adjuntos, etc.) (\"Contenido del Usuario\"). Concedes a NTJ una licencia no exclusiva, mundial y libre de regalías para alojar, almacenar, procesar, reproducir y mostrar el Contenido del Usuario según sea necesario para operar y mejorar el Servicio. Si habilitas funciones públicas, otros usuarios pueden ver ese contenido. Eres responsable de no compartir información confidencial que no estés autorizado a divulgar.",
      },
      {
        title: "9. Suscripciones, facturación y cancelaciones",
        body:
          "Ciertas funciones pueden requerir una suscripción de pago, add-on de pago u otro acceso pagado. Cuentas nuevas elegibles pueden recibir un trial gratis de cinco (5) días si se muestra en checkout. Al comenzar un trial, ingresar un método de pago y marcar la casilla de aceptación en checkout, nos autorizas a nosotros y a nuestro procesador de pagos a cobrar automáticamente el plan seleccionado cuando termine el trial, salvo que canceles antes de que termine. La elegibilidad del trial no está garantizada, generalmente se limita a un trial por usuario/cliente/método de pago, y puede denegarse o revocarse por abuso. Las tarifas se facturan por adelantado de forma recurrente y prepagada (mensual o anual) salvo indicación contraria en checkout. Puedes cancelar en cualquier momento; la cancelación detiene renovaciones futuras, tu acceso permanece disponible hasta el final del periodo pagado actual y se suspende al terminar ese periodo salvo que se renueve. Reembolsos: toda compra es final después de un pago exitoso. Salvo que la ley exija lo contrario o NTJ lo indique explícitamente por escrito, las tarifas de suscripción, add-ons, cargos de conversión de trial, renovaciones, pagos anuales, periodos parciales, acceso no usado, downgrades, cancelaciones después de renovación y compras realizadas por error no son reembolsables. Eres responsable de cancelar antes de que un trial se convierta o antes de una renovación para evitar cargos adicionales.",
      },
      {
        title: "10. Servicios y enlaces de terceros",
        body:
          "El Servicio puede integrarse, depender o enlazar con servicios de terceros, incluyendo proveedores de hosting, base de datos, autenticación, almacenamiento, procesamiento de pagos, procesamiento de IA, email, seguridad, distribución de apps, analítica, brokers, data de mercado, gráficas y soporte. Estos pueden incluir cuentas de proveedores controladas por NTJ como Stripe, Supabase, Vercel, OpenAI u otros proveedores de IA, Expo, Apple, Google, Resend, hCaptcha y proveedores similares, y, si se habilitan en el futuro, proveedores de conexión de broker como SnapTrade o Webull. Los servicios de terceros no están bajo nuestro control. No los respaldamos ni somos responsables de su disponibilidad, exactitud, seguridad, términos o prácticas de privacidad.",
      },
      {
        title: "10.1 Integraciones de broker; SnapTrade y Webull",
        body:
          "El sync directo de broker, incluyendo integraciones con SnapTrade y Webull, puede estar deshabilitado, limitado, en beta o sujeto a aprobación de proveedores antes de estar disponible públicamente. Mientras el sync directo esté deshabilitado, debes usar imports manuales de statements de broker, historial de órdenes, CSV o XLSX cuando estén disponibles. Si el sync directo se habilita, las conexiones de broker están diseñadas para ser solo lectura salvo que indiquemos claramente lo contrario. NTJ no coloca trades, enruta órdenes, retira fondos, custodia activos, administra cuentas de corretaje ni garantiza que la data del broker sea completa, actual o precisa. Autorizas a NTJ y a sus proveedores de servicio a solicitar, recibir, almacenar, procesar y mostrar la data de broker necesaria para el Servicio, que puede incluir identificadores de cuenta, datos de perfil de cuenta, balances, holdings, posiciones, órdenes, actividades, transacciones, fills, fees, comisiones, timestamps y metadata relacionada. Eres responsable de mantener tu relación con el broker y cumplir con sus términos.",
      },
      {
        title: "10.2 Nombres, logos y marcas de terceros",
        body:
          "Los nombres, logos, nombres de brokers, nombres de plataformas, marcas, screenshots, statements y otros materiales de terceros pertenecen a sus respectivos dueños. Cualquier referencia en el Servicio es solo para identificación, compatibilidad, importación de datos o fines descriptivos, y no implica auspicio, endoso, alianza o afiliación salvo que se indique expresamente por escrito. No puedes usar el Servicio para copiar, subir, mostrar o distribuir contenido, logos, datos o marcas de terceros salvo que tengas los derechos necesarios o estés legalmente autorizado a hacerlo.",
      },
      {
        title: "11. Propiedad intelectual",
        body:
          "El Servicio, incluyendo software, diseño, logos, marcas y contenido provisto por NTJ (excluyendo Contenido del Usuario), pertenece a NTJ y/o licenciantes y está protegido por leyes de propiedad intelectual. Sujeto al cumplimiento de estos Términos, NTJ te concede una licencia limitada, no exclusiva, no transferible y revocable para acceder y usar el Servicio para uso personal o interno.",
      },
      {
        title: "12. Renuncias",
        body:
          "EL SERVICIO (INCLUYENDO BUSINESS AI COACHING, NEURO ANALYSIS, OPTION FLOW INTELLIGENCE, ANALÍTICA, PROYECCIONES, SIMULACIONES, REPORTES Y ALERTAS) SE OFRECE \"TAL CUAL\" Y \"SEGÚN DISPONIBILIDAD\". EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, NTJ RENUNCIA A TODAS LAS GARANTÍAS, EXPRESAS O IMPLÍCITAS, INCLUYENDO GARANTÍAS IMPLÍCITAS DE COMERCIABILIDAD, IDONEIDAD PARA UN PROPÓSITO PARTICULAR, NO INFRACCIÓN Y CUALQUIER GARANTÍA DERIVADA DEL CURSO DE NEGOCIOS O USO COMERCIAL. NO GARANTIZAMOS QUE EL SERVICIO SEA ININTERRUMPIDO, LIBRE DE ERRORES, SEGURO, NI QUE CUALQUIER DATO, RESULTADO, MÉTRICA, PNL, OUTPUT DE IA, PROYECCIÓN, SIMULACIÓN O REPORTE SEA PRECISO, CONFIABLE, COMPLETO, CONSISTENTE O ADECUADO PARA TUS PROPÓSITOS.",
      },
      {
        title: "13. Limitación de responsabilidad",
        body:
          "EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, NTJ Y SUS AFILIADOS NO SERÁN RESPONSABLES POR DAÑOS INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENCIALES, EJEMPLARES O PUNITIVOS, O POR PÉRDIDA DE GANANCIAS, INGRESOS, DATOS O GOODWILL, DERIVADOS DEL USO O INCAPACIDAD DE USO DEL SERVICIO, INCLUYENDO CUALQUIER CONFIANZA EN BUSINESS AI COACHING. EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, LA RESPONSABILIDAD TOTAL DE NTJ NO EXCEDERÁ EL MONTO PAGADO A NTJ POR EL SERVICIO EN LOS DOCE (12) MESES ANTERIORES AL EVENTO QUE DIO ORIGEN AL RECLAMO. ALGUNAS JURISDICCIONES NO PERMITEN CIERTAS LIMITACIONES, POR LO QUE ALGUNAS LIMITACIONES PUEDEN NO APLICARTE.",
      },
      {
        title: "14. Indemnización",
        body:
          "Aceptas defender, indemnizar y mantener indemne a NTJ y sus Afiliados frente a cualquier reclamo, daño, responsabilidad, pérdida o gasto (incluyendo honorarios razonables de abogados) derivados de tu uso del Servicio, tu Contenido del Usuario, tu violación de estos Términos o la violación de derechos de terceros.",
      },
      {
        title: "15. Terminación",
        body:
          "Podemos suspender o terminar tu acceso al Servicio en cualquier momento, con o sin aviso, si creemos razonablemente que has violado estos Términos o si debemos hacerlo para cumplir la ley, proteger el Servicio o prevenir daños. Puedes dejar de usar el Servicio en cualquier momento. Al terminar, tu derecho de uso cesa. Ciertas disposiciones sobreviven a la terminación, incluyendo propiedad intelectual, renuncias, limitación de responsabilidad e indemnización.",
      },
      {
        title: "16. Ley aplicable y resolución de disputas",
        body:
          "Estos Términos se rigen por las leyes de la jurisdicción en la que NTJ está establecida, sin aplicar principios de conflicto de leyes. Aceptas que cualquier disputa relacionada con estos Términos o el Servicio será presentada ante tribunales competentes en esa jurisdicción, salvo que la ley aplicable disponga lo contrario.",
      },
      {
        title: "17. Avisos",
        body:
          "Podemos enviarte avisos mediante el Servicio, correo electrónico u otros medios razonables. Los avisos a NTJ deben enviarse a support@neurotrader-journal.com.",
      },
      {
        title: "18. Misceláneos",
        body:
          "Acuerdo completo: estos Términos constituyen el acuerdo completo entre tú y NTJ. Separabilidad: si alguna disposición es inválida, el resto permanece vigente. No renuncia: la falta de aplicación no es renuncia. Cesión: no puedes ceder tus derechos u obligaciones sin consentimiento; nosotros podemos ceder. Fuerza mayor: no somos responsables por demoras o fallas fuera de nuestro control razonable.",
      },
      {
        title: "19. Contacto",
        body:
          "Si tienes preguntas sobre estos Términos o deseas reportar una violación, contáctanos en: support@neurotrader-journal.com.",
      },
    ],
  },
};

export default function TermsPage() {
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
              {isEs ? "Términos" : "Terms"}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold">{content.title}</h1>
            <p className="text-sm text-slate-400 mt-2">{content.updated}</p>
          </div>
          <p className="text-sm text-slate-400 max-w-3xl">{content.intro}</p>
          <p className="text-sm text-amber-200 max-w-3xl">{content.important}</p>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <Link href="/privacy" className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-emerald-400 hover:text-emerald-200">
              {isEs ? "Política de Privacidad" : "Privacy Policy"}
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
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{section.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
