# OSS Insight fixtures

- `trends-unavailable.json`: real response of `GET /v1/trends/repos/?period=past_24_hours`, saved 2026-10-31.
- All other files are hand-written in the documented shape (`{type, data: {columns, rows, result}}`).
  On 2026-10-31 the live `/v1/collections/` and `/v1/collections/{id}/repos/` answered HTTP 500
  (`{"message":"Request failed with status code 401"}`), so no live collection response could be saved.
  Replace these files with real responses once the endpoints work again.
