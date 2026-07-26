#!/usr/bin/env python3
"""Fetch latest prices using yfinance and write prices.json."""
import json, time, sys

try:
    import yfinance as yf
except ImportError:
    print("Installing yfinance...", file=sys.stderr)
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'yfinance', '-q'])
    import yfinance as yf

SYMBOLS = [
    # SGX
    'D05.SI','O39.SI','C2PU.SI','AJBU.SI','J69U.SI','CJLU.SI','C38U.SI',
    'ME8U.SI','9A4U.SI','C52.SI','MXNU.SI','DCRU.SI','BUOU.SI','P40U.SI',
    'P9D.SI','CFA.SI','OV8.SI','P8Z.SI','AGS.SI','Z74.SI','HMN.SI',
    'DHLU.SI','QL3.SI','A7RU.SI','Y92.SI','OXMU.SI',
    # LSE
    'HSBA.L','LGEN.L','MNG.L','HFEL.L','ICG.L','TFIF.L',
    'PHP.L','JEPG.L','JEPQ.L','WINC.L','VWRP.L','SMH.L',
    # US
    'NVDA','MSFT','ADX','GOOG',
]

def download_with_retry(symbols, attempts=3, backoff=5):
    """Yahoo occasionally rejects/rate-limits the batch call; retry before giving up."""
    for attempt in range(1, attempts + 1):
        try:
            return yf.download(
                symbols,
                period='5d',
                interval='1d',
                auto_adjust=True,
                progress=False,
                group_by='ticker'
            )
        except Exception as e:
            print(f"  batch download attempt {attempt}/{attempts} failed: {e}", file=sys.stderr)
            if attempt < attempts:
                time.sleep(backoff * attempt)
    return None

def parse_symbol(data, sym, single):
    closes = (data['Close'] if single else data[sym]['Close']).dropna()
    if len(closes) == 0:
        return None
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) >= 2 else None
    pct  = ((last - prev) / prev * 100) if prev else None
    return {'price': round(last, 4), 'pct': round(pct, 4) if pct is not None else None}

prices = {}
data = download_with_retry(SYMBOLS)

if data is not None:
    single = len(SYMBOLS) == 1
    for sym in SYMBOLS:
        try:
            result = parse_symbol(data, sym, single)
            if result is not None:
                prices[sym] = result
        except Exception as e:
            print(f"  {sym}: {e}", file=sys.stderr)

# Fall back to per-symbol fetches for anything still missing (batch endpoint
# occasionally drops individual tickers even when the overall call succeeds).
missing = [s for s in SYMBOLS if s not in prices]
for sym in missing:
    try:
        single_data = download_with_retry([sym], attempts=2, backoff=5)
        if single_data is None:
            continue
        result = parse_symbol(single_data, sym, True)
        if result is not None:
            prices[sym] = result
    except Exception as e:
        print(f"  {sym} (fallback): {e}", file=sys.stderr)

output = {
    'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'count':   len(prices),
    'prices':  prices
}
with open('prices.json', 'w') as f:
    json.dump(output, f)

print(f"Fetched {len(prices)}/{len(SYMBOLS)} prices")
if len(prices) == 0:
    sys.exit(1)
