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
    'DHLU.SI','QL3.SI','A7RU.SI','AU8U.SI','Y92.SI','OXMU.SI',
    # LSE
    'HSBA.L','LGEN.L','MNG.L','HFEL.L','ICG.L','TFIF.L',
    'PHP.L','JEPG.L','JEPQ.L','WINC.L','VWRP.L',
    # US
    'NVDA','MSFT','ADX',
]

prices = {}
try:
    # Download last 5 days for all symbols in one batch call
    data = yf.download(
        SYMBOLS,
        period='5d',
        interval='1d',
        auto_adjust=True,
        progress=False,
        group_by='ticker'
    )

    for sym in SYMBOLS:
        try:
            if len(SYMBOLS) == 1:
                closes = data['Close'].dropna()
            else:
                closes = data[sym]['Close'].dropna()

            if len(closes) == 0:
                continue
            last  = float(closes.iloc[-1])
            prev  = float(closes.iloc[-2]) if len(closes) >= 2 else None
            pct   = ((last - prev) / prev * 100) if prev else None
            prices[sym] = {'price': round(last, 4), 'pct': round(pct, 4) if pct is not None else None}
        except Exception as e:
            print(f"  {sym}: {e}", file=sys.stderr)

except Exception as e:
    print(f"Download error: {e}", file=sys.stderr)

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
