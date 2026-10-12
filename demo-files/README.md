# Amberd Lite demo files (upload to Google Drive)

Upload all three files into one Google Drive folder, e.g. **Amberd Lite Demo — Finance**.

| File | What it is |
| --- | --- |
| `PO-2026-2001.pdf` | Purchase order from Northwind to Contoso Workplace Solutions — total **$23,450.00**, Net 30 |
| `INV-88412.xlsx` | Supplier invoice with **intentional discrepancies** — total **$25,580.00** |
| `INV-88413-matching.xlsx` | Correct invoice for the same order — should pass |

## Answer key for PO-2026-2001 vs INV-88412

| # | Discrepancy | Expected (PO) | Actual (invoice) | Impact |
| --- | --- | --- | --- | --- |
| 1 | Standing desk quantity | 10 | 12 | +$1,280.00 |
| 2 | 27-inch monitor unit price | $289.00 | $305.00 | +$400.00 |
| 3 | Line not on the purchase order: Expedited Freight | — | 1 × $450.00 | +$450.00 |
| 4 | Payment terms | Net 30 | Net 15 | terms |
| 5 | Total | $23,450.00 | $25,580.00 | **+$2,130.00 overbilled** |

The prompt never contains these values; they must be found in the documents.
