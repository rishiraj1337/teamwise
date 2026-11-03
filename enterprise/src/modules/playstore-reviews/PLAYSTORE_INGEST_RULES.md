# Google Play Store ingest (enterprise-review-platform)

Single-backend replacement for the former `playstore-reviews` scraper. All rows land in **`timePayReview.review`** with channel **`Google Playstore`**.

## Classification rules (on ingest)

| Input | Rule |
|-------|------|
| **Category** | Always `Playstore review` |
| **Subcategory** | 1–3★ → `Negative`; 4–5★ → `Positive` |
| **Priority** | 1–2★ → `Medium`; 3–5★ → `Low` |
| **Status** | `New` |
| **Resolution** | `N/A` |
| **Department** | 1–2★ → `Engineering`; 3–5★ → `Customer Support` |
| **Channel** | `Google Playstore` |

Legacy DB labels `playstore feedback` / `playstore review` are normalized via SQL (`03`, `06`).

Optional **AI** (`ai_enabled` + `ai_source_playstore_enabled`) may override category, subcategory, priority, and department for long review text; on failure, rules above are re-applied.

## Collection rules

- Package, country, languages, windows: DB settings (`playstore_*`, `polling_playstore_*`).
- Per-language checkpoints in `review_collection_checkpoint` (initial import days + overlap days).
- Dedupe by Google `source_review_id` in `review_source_id_map`.
- New rows get `TPR####` from `review_id_sequence`.
- Inserts set `category_id`, `subcategory_id`, `priority_id` when taxonomy tables exist.

## SQL maintenance

- `sql/07_playstore_priority_from_star_rating.sql` — backfill priority from stars for **Google Playstore** rows only.

## Code map

- `playstoreClassification.js` — canonical rule functions
- `normalizeReview.js` — scraper → normalized row
- `googlePlayClient.js` — pagination + date cutoff
- `reviewCollector.js` — scheduler + manual trigger target

## API (JWT + RBAC)

- `GET /api/ingestion/playstore/status` — `reviews:read`
- `POST /api/ingestion/playstore/trigger` — `pipeline:trigger`

Teamwise UI uses the platform bridge token; HR login stays on Teamwise FastAPI only.
