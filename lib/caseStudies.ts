export type CaseStudyCopy = {
  en: string;
  es: string;
};

export type TradingBusinessCaseStudy = {
  slug: string;
  publisher: "SEC" | "The Wall Street Journal" | "Bloomberg";
  published: string;
  title: CaseStudyCopy;
  sourceTitle: string;
  sourceUrl: string;
  finding: CaseStudyCopy;
  operatingLesson: CaseStudyCopy;
  application: CaseStudyCopy;
  tags: CaseStudyCopy[];
};

export const TRADING_BUSINESS_CASE_STUDIES: TradingBusinessCaseStudy[] = [
  {
    slug: "day-trading-costs-and-break-even",
    publisher: "SEC",
    published: "April 19, 2005",
    title: {
      en: "Trading costs make break-even a business metric",
      es: "Los costos convierten el break-even en una metrica empresarial",
    },
    sourceTitle: "Day Trading: Your Dollars at Risk",
    sourceUrl: "https://www.sec.gov/about/reports-publications/investorpubsdaytipshtm",
    finding: {
      en: "The SEC describes day trading as highly risky, stressful, and expensive, and says traders should know how much they must earn to cover operating expenses and break even.",
      es: "La SEC describe el day trading como una actividad de alto riesgo, estresante y costosa, y senala que el trader debe conocer cuanto necesita producir para cubrir gastos y llegar a break-even.",
    },
    operatingLesson: {
      en: "Gross P&L is not enough. Commissions, platform costs, data, financing, and losses belong in the same operating record.",
      es: "El P&L bruto no es suficiente. Comisiones, plataformas, data, financiamiento y perdidas deben vivir en el mismo registro operativo.",
    },
    application: {
      en: "Maintain a business P&L, define loss limits before the session, and evaluate performance after all costs.",
      es: "Mantener un P&L empresarial, definir limites de perdida antes de la sesion y evaluar resultados despues de todos los costos.",
    },
    tags: [
      { en: "Cost control", es: "Control de costos" },
      { en: "Break-even", es: "Break-even" },
      { en: "Risk capital", es: "Capital de riesgo" },
    ],
  },
  {
    slug: "risk-controls-as-an-operating-system",
    publisher: "SEC",
    published: "July 29, 1999",
    title: {
      en: "Risk controls must be measurable, reviewed, and improved",
      es: "Los controles de riesgo deben medirse, revisarse y mejorarse",
    },
    sourceTitle: "Joint Statement: Broker-Dealer Risk Management Practices",
    sourceUrl: "https://www.sec.gov/news/studies/bdriskp.htm",
    finding: {
      en: "The SEC, NYSE, and NASD review links strong risk management to defined activities and limits, consistent data, independent monitoring, documented audits, and follow-through on findings.",
      es: "La revision de la SEC, NYSE y NASD conecta una gestion de riesgo solida con actividades y limites definidos, data consistente, monitoreo independiente, auditorias documentadas y seguimiento de hallazgos.",
    },
    operatingLesson: {
      en: "A rule written once is not a control. It becomes a control when execution is measured against it and exceptions produce a review.",
      es: "Una regla escrita una vez no es un control. Se convierte en control cuando la ejecucion se mide contra ella y las excepciones producen una revision.",
    },
    application: {
      en: "Connect the business plan to daily limits, alerts, execution records, and a recurring audit trail.",
      es: "Conectar el plan empresarial con limites diarios, alertas, registros de ejecucion y una auditoria recurrente.",
    },
    tags: [
      { en: "Risk governance", es: "Gobernanza de riesgo" },
      { en: "Internal controls", es: "Controles internos" },
      { en: "Audit trail", es: "Rastro de auditoria" },
    ],
  },
  {
    slug: "six-minute-stock-research",
    publisher: "The Wall Street Journal",
    published: "May 5, 2025",
    title: {
      en: "A fast decision is not the same as researched conviction",
      es: "Una decision rapida no equivale a conviccion investigada",
    },
    sourceTitle: "Many Investors Tend to Spend Just 6 Minutes on Stock Research",
    sourceUrl: "https://www.wsj.com/public/resources/documents/N0QWlHUoFoQxiEORAAaB-WSJNewsPaper-5-5-2025.pdf",
    finding: {
      en: "The Journal reported research finding that the median investor spent about six minutes researching a stock before purchase, with much of that attention focused on recent price charts rather than fundamentals and risk statistics.",
      es: "The Journal reporto una investigacion que encontro que el inversionista mediano dedico cerca de seis minutos a investigar una accion antes de comprar, concentrandose mayormente en graficas recientes y no en fundamentales y estadisticas de riesgo.",
    },
    operatingLesson: {
      en: "Attention is not diligence. A repeatable research checklist reduces the influence of headlines, recency, and impulse.",
      es: "Atencion no es diligencia. Un checklist repetible de research reduce la influencia de titulares, recencia e impulso.",
    },
    application: {
      en: "Document the thesis, invalidation conditions, risk, source evidence, and decision before capital is committed.",
      es: "Documentar la tesis, condiciones de invalidacion, riesgo, evidencia y decision antes de comprometer capital.",
    },
    tags: [
      { en: "Research process", es: "Proceso de research" },
      { en: "Decision quality", es: "Calidad de decision" },
      { en: "Behavior", es: "Conducta" },
    ],
  },
  {
    slug: "meme-stock-gains-reversed",
    publisher: "Bloomberg",
    published: "May 8, 2022",
    title: {
      en: "Unrealized gains can disappear without a protection process",
      es: "Las ganancias no realizadas pueden desaparecer sin proteccion",
    },
    sourceTitle: "Day Trader Army Loses All the Money It Made in Meme-Stock Era",
    sourceUrl: "https://www.bloomberg.com/news/articles/2022-05-08/day-trader-army-loses-all-the-money-it-made-in-meme-stock-era",
    finding: {
      en: "Bloomberg reported an estimate that retail traders who entered during the pandemic had collectively surrendered their earlier gains as speculative assets reversed.",
      es: "Bloomberg reporto una estimacion segun la cual traders retail que entraron durante la pandemia habian devuelto colectivamente sus ganancias anteriores al revertirse los activos especulativos.",
    },
    operatingLesson: {
      en: "A favorable market regime can hide weak sizing, concentration, and exit discipline. Performance must be reviewed across regimes, not only during the winning period.",
      es: "Un regimen favorable puede ocultar fallas de sizing, concentracion y salidas. El desempeno debe revisarse entre regimenes, no solo durante el periodo ganador.",
    },
    application: {
      en: "Track drawdown, risk concentration, rule adherence, and retained gains alongside headline returns.",
      es: "Medir drawdown, concentracion de riesgo, cumplimiento de reglas y ganancias retenidas junto al retorno principal.",
    },
    tags: [
      { en: "Drawdown", es: "Drawdown" },
      { en: "Market regimes", es: "Regimenes de mercado" },
      { en: "Capital protection", es: "Proteccion de capital" },
    ],
  },
  {
    slug: "retail-risk-losses-2022",
    publisher: "Bloomberg",
    published: "December 9, 2022",
    title: {
      en: "Risk concentration changes the outcome of the same market",
      es: "La concentracion de riesgo cambia el resultado del mismo mercado",
    },
    sourceTitle: "Retail Traders Lose $350 Billion in Brutal Year for Taking Risks",
    sourceUrl: "https://www.bloomberg.com/news/articles/2022-12-09/retail-traders-lose-350-billion-in-brutal-year-for-taking-risks",
    finding: {
      en: "Bloomberg cited a Vanda Research estimate that active retail portfolios fell materially more than the broad U.S. equity index during 2022, reflecting heavier exposure to speculative positions.",
      es: "Bloomberg cito una estimacion de Vanda Research segun la cual portfolios retail activos cayeron materialmente mas que el indice amplio de acciones de EE. UU. durante 2022, reflejando mayor exposicion especulativa.",
    },
    operatingLesson: {
      en: "Benchmark comparison, exposure limits, and scenario analysis reveal risks that a standalone P&L cannot explain.",
      es: "La comparacion con benchmarks, limites de exposicion y escenarios revelan riesgos que un P&L aislado no puede explicar.",
    },
    application: {
      en: "Review concentration and risk-adjusted performance before increasing capital or position size.",
      es: "Revisar concentracion y desempeno ajustado por riesgo antes de aumentar capital o tamano de posicion.",
    },
    tags: [
      { en: "Concentration", es: "Concentracion" },
      { en: "Benchmarking", es: "Benchmarking" },
      { en: "Risk-adjusted review", es: "Revision ajustada por riesgo" },
    ],
  },
];

