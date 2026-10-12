# Local enterprise document repository

Sample documents served by the Amberd **Local Enterprise Document Connector**.
This simulates an enterprise repository (e.g. a shared drive) for the hackathon
demo; it is not a live Google Drive integration.

- `purchase-orders/` and `invoices/` are authorized for the Finance connection.
- `hr-confidential/` exists on disk but is **not** authorized — requests for it
  are rejected server-side, which demonstrates connector permission enforcement.

Document ids are `<collection>/<file name without extension>`.
