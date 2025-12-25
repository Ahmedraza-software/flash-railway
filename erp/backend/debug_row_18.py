"""Debug row 18 to see what's happening."""
import requests
import csv
import io
from urllib.request import Request, urlopen

GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1NKy_gYz-fzghifV8RoCiYVUUYMTiq2FFIzJb8WwsPHI/export?format=csv&gid=304958374"

def fetch_csv():
    req = Request(GOOGLE_SHEET_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as r:
        data = r.read()
    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("latin-1", errors="ignore")

csv_text = fetch_csv()
reader = csv.reader(io.StringIO(csv_text))
rows = list(reader)

# Find header
header_idx = 0
for i, r in enumerate(rows[:25]):
    joined = ",".join([str(x or "") for x in r]).lower()
    if "name" in joined and ("cnic" in joined or "fss" in joined):
        header_idx = i
        break

headers = rows[header_idx]
data_rows = rows[header_idx + 1:]

print("=" * 80)
print(f"Header row (index {header_idx}):")
print(headers[:10])
print("\n" + "=" * 80)
print(f"Row 18 (data row index 17):")
if len(data_rows) > 17:
    row_18 = data_rows[17]
    print(f"Length: {len(row_18)}")
    for i, (h, v) in enumerate(zip(headers, row_18)):
        if v and str(v).strip():
            print(f"  [{i}] {h}: {v}")
else:
    print("Row 18 not found")

print("\n" + "=" * 80)
