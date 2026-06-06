#!/usr/bin/env python3
"""Fetches latest prices from Yahoo Finance and writes prices.json."""
import urllib.request, json, time, sys

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

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
}

prices = {}
errors = []

for i in range(0, len(SYMBOLS), 20):
    batch = SYMBOLS[i:i+20]
    url = ('https://query1.finance.yahoo.com/v7/finance/quote'
           f'?symbols={",".join(batch)}'
           '&fields=regularMarketPrice,regularMarketChangePercent,currency')
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            for q in data.get('quoteResponse', {}).get('result', []):
                prices[q['symbol']] = {
                    'price': q.get('regularMarketPrice'),
                    'pct':   q.get('regularMarketChangePercent'),
                    'cur':   q.get('currency','')
                }
    except Exception as e:
        errors.append(f"{batch}: {e}")
    time.sleep(0.3)

output = {
    'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'count':   len(prices),
    'prices':  prices
}
with open('prices.json', 'w') as f:
    json.dump(output, f)

print(f"Fetched {len(prices)}/{len(SYMBOLS)} prices")
if errors:
    print("Errors:", errors, file=sys.stderr)
