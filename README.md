# Food NLP Search Backend

A production-ready Node.js + Express backend for typo-tolerant, full-text, and fuzzy food search using PostgreSQL and Redis.

---

## Features
- **PostgreSQL** with `pg_trgm` and full-text search
- **Typo-tolerant** and **fuzzy** search (trigram, Levenshtein)
- **Weighted** search: food name > description
- **Phrase, partial, and prefix** matching
- **JWT-based authentication**
- **Redis caching** for fast repeated queries
- **Pagination** and **result highlighting**
- **Security**: helmet, compression, CORS

---

## Requirements
- Node.js 18+
- PostgreSQL (with `pg_trgm` extension enabled)
- Redis (Aiven or local)

---

## Setup

1. **Clone the repo**
2. **Install dependencies**
   ```sh
   npm install
   ```
3. **Configure your `.env` file**
   ```env
   DATABASE_URL=postgres://username:password@localhost:5432/yourdb
   SECRET_KEY=your_jwt_secret
   PORT=3000
   REDIS_URL=rediss://user:password@your-redis-host:port
   CORS_ORIGINS=http://localhost:3000
   ```
4. **Prepare your database**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ALTER TABLE food_nutrition ADD COLUMN IF NOT EXISTS document tsvector;
   UPDATE food_nutrition SET document = to_tsvector('english', food_name || ' ' || description);
   CREATE INDEX IF NOT EXISTS idx_food_fts ON food_nutrition USING GIN (document);
   CREATE INDEX IF NOT EXISTS idx_food_trgm ON food_nutrition USING GIN (food_name gin_trgm_ops);
   ```
5. **Start the server**
   ```sh
   npm start
   ```

---

## API Usage

### Authentication
- All endpoints require a JWT Bearer token:
  - `Authorization: Bearer <token>`

### Search Endpoint

#### `GET /api/v1/search`

**Query Parameters:**
- `q` (string, required): Search query
- `limit` (int, optional): Max results (default 10, max 50)
- `offset` (int, optional): Pagination offset (default 0)

**Example:**
```
GET /api/v1/search?q=almond&limit=5
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total": 2,
  "count": 2,
  "limit": 10,
  "offset": 0,
  "results": [
    {
      "id": 8,
      "food_name": "Almonds, raw",
      "description": "Raw whole almonds",
      "image_url": "https://example.com/almonds.jpg",
      "rank": 0,
      "name_similarity": 0.2,
      "desc_similarity": 0.14,
      "exact_name_match": false,
      "ilike_name_match": false,
      "ilike_desc_match": false,
      "food_name_highlight": "<mark>Almonds</mark>, raw",
      "description_highlight": "Raw whole <mark>almonds</mark>",
      "smart_score": 0.25
    }
    // ... more results
  ],
  "cached": true // (optional, present if result was served from cache)
}
```

**Error Responses:**
- `400 Bad Request`: Missing/invalid query or too short
- `401 Unauthorized`: Missing/invalid JWT
- `404 Not Found`: No highly relevant results
- `500 Internal Server Error`: Unexpected error

---

## Search Logic
- **Weighted full-text**: food name > description
- **Trigram similarity**: typo-tolerance
- **Levenshtein**: fuzzy matching
- **Phrase search**: quoted queries
- **Prefix/partial**: ILIKE
- **Smart score**: Combines similarity, rank, Levenshtein
- **Highlighting**: `<mark>` tags for UI

---

## Security
- JWT authentication required
- CORS restricted by `CORS_ORIGINS`
- Helmet and compression enabled

---

## Caching
- Redis caches search results for 5 minutes per query/limit/offset

---

## License
MIT 