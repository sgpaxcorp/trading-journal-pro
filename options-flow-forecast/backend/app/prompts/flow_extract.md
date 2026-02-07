You are extracting options flow prints from a screenshot.
Return JSON ONLY matching this schema:
{
  "rows": [
    {
      "symbol": "string",
      "underlying": "string",
      "expiry": "YYYY-MM-DD or empty",
      "strike": 0,
      "option_type": "C or P",
      "side": "ASK|BID|MID|UNKNOWN",
      "price": 0,
      "size": 0,
      "premium": 0,
      "open_interest": 0,
      "iv": 0,
      "delta": 0,
      "timestamp": "HH:MM or ISO"
    }
  ]
}
If a field is missing, use null. Use numeric values where possible.
Do not include any extra keys.
