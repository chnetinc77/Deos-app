require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FACT_TOOL = {
  name: 'record_facts',
  description: 'Record new or updated facts about the user learned from this message.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['goal', 'value', 'pattern', 'constraint', 'preference'] },
            content: { type: 'string' },
            confidence: { type: 'number' }
          },
          required: ['category', 'content', 'confidence']
        }
      }
    },
    required: ['facts']
  }
};

async function getSelfModel() {
  const { rows } = await pool.query(
    `SELECT category, content, confidence FROM user_facts
     WHERE superseded_by IS NULL AND confidence >= 0.5
     ORDER BY category, confidence DESC`
  );
  if (rows.length === 0) return 'No facts recorded yet.';
  return rows.map(r => `[${r.category}] ${r.content} (confidence: ${r.confidence})`).join('\n');
}

async function getRecentEvents(limit = 10) {
  const { rows } = await pool.query(
    `SELECT event_type, raw_content, created_at FROM events ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.reverse();
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const selfModel = await getSelfModel();
    const recentEvents = await getRecentEvents();

    const eventContext = recentEvents.length
      ? recentEvents.map(e => `[${e.event_type}] ${e.raw_content}`).join('\n')
      : 'No recent events.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: `You are Deos, a personal cognitive assistant that has been learning about this specific user over time. Use what you know about them to give grounded, specific responses that reference their actual history, goals, and patterns — not generic advice. Never make the decision for them; surface relevant context and let them decide.\n\nWhat you currently know about this user:\n${selfModel}`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        { role: 'user', content: `Recent context:\n${eventContext}\n\nUser message: ${message}` }
      ],
      tools: [FACT_TOOL]
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'record_facts');
    const replyText = textBlock ? textBlock.text : '';

    const eventResult = await pool.query(
      `INSERT INTO events (event_type, raw_content) VALUES ('chat', $1) RETURNING id`,
      [message]
    );
    const eventId = eventResult.rows[0].id;

    let newFactIds = [];
    if (toolBlock && toolBlock.input.facts) {
      for (const fact of toolBlock.input.facts) {
        const { rows } = await pool.query(
          `INSERT INTO user_facts (category, content, confidence, source_event_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [fact.category, fact.content, fact.confidence, eventId]
        );
        newFactIds.push(rows[0].id);
      }
      await pool.query(`UPDATE events SET extracted_fact_ids = $1 WHERE id = $2`, [newFactIds, eventId]);
    }

    res.json({ reply: replyText, factsLearned: newFactIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/facts', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, category, content, confidence, first_seen FROM user_facts
     WHERE superseded_by IS NULL ORDER BY category, confidence DESC`
  );
  res.json(rows);
});

app.delete('/api/facts/:id', async (req, res) => {
  await pool.query(`DELETE FROM user_facts WHERE id = $1`, [req.params.id]);
  res.json({ deleted: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Deos backend running on port ${PORT}`));
