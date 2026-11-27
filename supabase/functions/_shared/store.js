export function createStore(prepare, schema, responseOrder) {
  const polls = `${schema}polls`;
  const responses = `${schema}responses`;
  const selectPoll = prepare(`SELECT id, title, description, dates FROM ${polls} WHERE id = $1`);
  const createPoll = prepare(`INSERT INTO ${polls} (id, title, description, dates) VALUES ($1, $2, $3, $4)`);
  const selectResponses = prepare(`
    SELECT name, dates, CASE WHEN token_hash = $1 THEN 1 ELSE 0 END AS is_own
    FROM ${responses} WHERE poll_id = $2 ORDER BY ${responseOrder}
  `);
  const saveResponse = prepare(`
    INSERT INTO ${responses} (poll_id, token_hash, name, dates) VALUES ($1, $2, $3, $4)
    ON CONFLICT (poll_id, token_hash) DO UPDATE SET name = excluded.name, dates = excluded.dates
  `);
  const checkHealth = prepare('SELECT 1');

  return {
    createPoll,
    async getPoll(id) {
      const [poll] = await selectPoll(id);
      return poll;
    },
    getResponses(id, hash) {
      return selectResponses(hash, id);
    },
    saveResponse,
    checkHealth,
  };
}
