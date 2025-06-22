const express = require('express');
const pool = require('../db');
const { getCache, setCache } = require('@dtwin/config');
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

function isTrivialQuery(q) {
  // Consider queries with only stopwords or < 2 chars as trivial
  return !q || q.trim().length < 2;
}

function highlightMatch(text, query) {
  if (!text || !query) return text;
  // Simple highlight: wrap all case-insensitive matches of query in <mark>
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

router.get('/',authMiddleware, async (req, res, next) => {
  let { q, limit = 10, offset = 0 } = req.query;
  limit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
  offset = Math.max(0, parseInt(offset, 10) || 0);

  if (typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid query parameter' });
  }
  if (isTrivialQuery(q)) {
    return res.status(400).json({ error: 'Query too short or not meaningful' });
  }

  // Cache key
  const cacheKey = `search:${q}:${limit}:${offset}`;

  try {
    // Try cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // Detect if query is a quoted phrase
    const isPhrase = /^".*"$/.test(q.trim());
    const phrase = isPhrase ? q.trim().slice(1, -1) : null;

    // Weighted tsvector
    const weighted_tsv = `setweight(to_tsvector('english', food_name), 'A') || setweight(to_tsvector('english', description), 'B')`;
    // Main robust search query
    const mainSql = `
      WITH ranked AS (
        SELECT DISTINCT ON (food_name, description)
          id, food_name, description, image_url,
          ts_rank(${weighted_tsv}, websearch_to_tsquery('english', $1)) AS rank,
          similarity(food_name, $1) AS name_similarity,
          similarity(description, $1) AS desc_similarity,
          (food_name = $1) AS exact_name_match,
          (food_name ILIKE $1) AS ilike_name_match,
          (description ILIKE $1) AS ilike_desc_match
        FROM food_nutrition
        WHERE (
          ${weighted_tsv} @@ websearch_to_tsquery('english', $1)
          OR food_name % $1
          OR description % $1
          OR food_name ILIKE $1 || '%'
          OR description ILIKE $1 || '%'
          ${isPhrase ? 'OR food_name ILIKE $2 OR description ILIKE $2' : ''}
          OR $2::text IS NULL
        )
        ORDER BY food_name, description, (food_name = $1) DESC, rank DESC, name_similarity DESC, desc_similarity DESC
      )
      SELECT id, food_name, description, image_url, rank, name_similarity, desc_similarity, exact_name_match, ilike_name_match, ilike_desc_match
      FROM ranked
      ORDER BY exact_name_match DESC, ilike_name_match DESC, ilike_desc_match DESC, rank DESC, name_similarity DESC, desc_similarity DESC
      LIMIT $3 OFFSET $4;
    `;
    const params = [q, isPhrase ? phrase : null, limit, offset];
    let { rows } = await pool.query(mainSql, params);

    // Fallback: if no results, try splitting query into words and searching for any
    if (rows.length === 0 && q.split(/\s+/).length > 1) {
      const words = q.split(/\s+/).filter(Boolean);
      const wordSql = `
        SELECT DISTINCT ON (food_name, description)
          id, food_name, description, image_url
        FROM food_nutrition
        WHERE ` + words.map((_, i) => `food_name ILIKE $${i+1} OR description ILIKE $${i+1}`).join(' OR ') + `
        LIMIT $${words.length+1} OFFSET $${words.length+2};
      `;
      const wordParams = words.map(w => `%${w}%`).concat([limit, offset]);
      rows = (await pool.query(wordSql, wordParams)).rows;
    }

    // Fallback: if still no results, suggest similar foods (trigram + fuzzy/Levenshtein)
    if (rows.length === 0) {
      const fallbackSql = `
        SELECT id, food_name, description, image_url,
               similarity(food_name, $1) AS name_similarity,
               similarity(description, $1) AS desc_similarity,
               levenshtein(lower(food_name), lower($1)) AS name_lev,
               levenshtein(lower(description), lower($1)) AS desc_lev
        FROM food_nutrition
        ORDER BY name_similarity DESC, desc_similarity DESC, name_lev ASC, desc_lev ASC
        LIMIT $2 OFFSET $3;
      `;
      rows = (await pool.query(fallbackSql, [q, limit, offset])).rows;
    }

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) FROM food_nutrition
      WHERE setweight(to_tsvector('english', food_name), 'A') || setweight(to_tsvector('english', description), 'B') @@ websearch_to_tsquery('english', $1)
         OR food_name % $1
         OR description % $1
         OR food_name ILIKE $1 || '%'
         OR description ILIKE $1 || '%'
         ${isPhrase ? 'OR food_name ILIKE $2 OR description ILIKE $2' : ''}
    `;
    const countParams = isPhrase ? [q, phrase] : [q];
    const { rows: countRows } = await pool.query(countSql, countParams);
    const total = parseInt(countRows[0]?.count || '0', 10);

    // Highlight matches
    const highlighted = rows.map(row => ({
      ...row,
      food_name_highlight: highlightMatch(row.food_name, q),
      description_highlight: highlightMatch(row.description, q)
    }));

    // Lower similarity threshold for short queries
    const similarityThreshold = q.length < 6 ? 0.10 : 0.2;
    const levenshteinThreshold = q.length < 6 ? 5 : 8;

    // Compute a smart score for each result
    const scored = highlighted.map(row => {
      // Use similarity, Levenshtein, and rank for a combined score
      // Higher similarity and rank, lower Levenshtein = better
      const sim = row.name_similarity || 0;
      const lev = typeof row.name_lev === 'number' ? row.name_lev : 10;
      const rank = row.rank || 0;
      // Smart score: prioritize similarity, then rank, then penalize Levenshtein
      row.smart_score = (sim * 2 + rank) - (lev * 0.15);
      return row;
    });

    // Always return the best N matches, sorted by smart_score
    const sorted = scored
      .filter(row =>
        (row.smart_score > 0.05) ||
        (row.name_similarity && row.name_similarity > similarityThreshold) ||
        (typeof row.name_lev === 'number' && row.name_lev <= levenshteinThreshold)
      )
      .sort((a, b) => b.smart_score - a.smart_score)
      .slice(0, limit);

    if (sorted.length === 0) {
      return res.status(404).json({ error: 'No highly relevant results found for your query.' });
    }
    const response = {
      total: sorted.length,
      count: sorted.length,
      limit,
      offset,
      results: sorted
    };
    await setCache(cacheKey, response, 300000);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router; 