# Neuro Analysis Data Providers

Neuro Analysis uses a multi-source provider router so company and ETF profiles can keep working when one free/public source is incomplete, rate limited, or not configured.

## Sources

| Provider | Env var | Used for | Notes |
| --- | --- | --- | --- |
| Yahoo Finance endpoints | none | Primary quote, profile, monthly chart, fund holdings when available | Undocumented public endpoints, so Neuro treats failures as normal and falls back. |
| Nasdaq public endpoints | none | Fallback price/profile for stocks and ETFs | No key required, but endpoint availability can vary. |
| SEC EDGAR APIs | `SEC_USER_AGENT` | Public company identity and annual XBRL fundamentals | Official SEC endpoints require a descriptive user agent. |
| Alpha Vantage | `ALPHA_VANTAGE_API_KEY` | Quote, monthly adjusted prices, company overview, ETF profile | Free key required. |
| Twelve Data | `TWELVE_DATA_API_KEY` | Quote, profile, monthly price history | Free tier key required. |
| Financial Modeling Prep | `FMP_API_KEY` or `FINANCIAL_MODELING_PREP_API_KEY` | Quote, profile, historical prices, ETF holdings and sector weights | Free plan key required. |
| OpenFIGI | `OPENFIGI_API_KEY` | Symbol mapping, FIGI, instrument classification | Key is optional but recommended for higher limits. |
| FRED | `FRED_API_KEY` | Rates, CPI, unemployment macro context | Free key required. |
| BLS Public Data API | `BLS_API_KEY` | CPI, PPI, unemployment macro context | Key is optional for lower-volume public access. |
| BEA API | `BEA_API_KEY` | GDP macro context | Free key required. |
| Treasury Fiscal Data API | none | Average Treasury interest rate context | Public endpoint, no key required. |

## Behavior

- Yahoo remains the primary source when it responds.
- Configured external providers supplement or replace missing quote, profile, ETF/fund, price, and macro data.
- Nasdaq and SEC remain no-key public fallbacks.
- Missing API keys do not fail the request. Neuro records provider status in `dataQuality.providerStatuses`.
- Provider errors are returned in `errors.externalProviders` so the UI can explain degraded data without blocking the company profile flow.

## Official Links

- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Alpha Vantage: https://www.alphavantage.co/
- Twelve Data: https://twelvedata.com/
- Financial Modeling Prep: https://site.financialmodelingprep.com/
- OpenFIGI: https://www.openfigi.com/
- FRED API keys: https://fred.stlouisfed.org/docs/api/api_key.html
- BLS Public Data API: https://www.bls.gov/developers/home.htm
- BEA API signup: https://apps.bea.gov/API/signup/index.cfm
- Treasury Fiscal Data API: https://fiscaldata.treasury.gov/
