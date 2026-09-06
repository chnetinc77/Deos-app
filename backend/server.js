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
            domain: { type: 'string', enum: ['health', 'finance', 'network', 'career', 'general'], description: 'Which life area this fact belongs to' },
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
    `SELECT category, domain, content, confidence FROM user_facts
     WHERE superseded_by IS NULL AND confidence >= 0.5
     ORDER BY category, confidence DESC`
  );
  if (rows.length === 0) return 'No facts recorded yet.';
  return rows.map(r => `[${r.category}/${r.domain}] ${r.content} (confidence: ${r.confidence})`).join('\n');
}

async function getRecentEvents(limit = 10) {
  const { rows } = await pool.query(
    `SELECT event_type, raw_content, created_at FROM events ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.reverse();
}

app.post('/api/conversations', async (req, res) => {
  try {
    const { title } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO conversations (title) VALUES ($1) RETURNING *`,
      [title || 'New conversation']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const selfModel = await getSelfModel();
    const recentEvents = await getRecentEvents();

    const eventContext = recentEvents.length
      ? recentEvents.map(e => `[${e.event_type}] ${e.raw_content}`).join('\n')
      : 'No recent events.';

    const systemPrompt = [
      {
        type: 'text',
        text: `You are Deos, a personal cognitive assistant that has been learning about this specific user over time. Use what you know about them to give grounded, specific responses that reference their actual history, goals, and patterns - not generic advice. Never make the decision for them; surface relevant context and let them decide. When recording facts, classify each one into a domain: health, finance, network (relationships/people), career, or general.

You have web search available. For any decision involving money, business, investment, relocation, or legal/regulatory exposure, you must proactively research relevant real-world factors even if the user did not ask you to. This includes, at minimum, explicitly checking:
- Personal liberty and criminal exposure: can civil or business debts result in criminal liability, arrest, travel bans, or imprisonment in that jurisdiction (this is a common and severe risk in many countries and is frequently missed by generic market research)
- Political and physical safety: active conflict, war, civil unrest, or government travel advisories affecting the country or region
- How the decision interacts with the user's own known personal circumstances, including nationality, citizenship, and current location, if known
- Market conditions, regulatory environment, corruption indices, ease of doing business, and staffing/labor market realities

Do not treat "rule of law" as satisfied by generic business-climate commentary alone - specifically search for criminal liability for debt, exit bans, and personal safety risk when the decision involves relocating to or operating in another country. Do not wait to be asked about risk factors - surface them unprompted if your research uncovers something materially relevant, even if it contradicts the premise the user seems to be operating under, and even if it is uncomfortable to say. Cite what you found.\n\nWhat you currently know about this user:\n${selfModel}`,
        cache_control: { type: 'ephemeral' }
      }
    ];

    let messages = [
      { role: 'user', content: `Recent context:\n${eventContext}\n\nUser message: ${message}` }
    ];

    const toolDefs = [FACT_TOOL, { type: 'web_search_20250305', name: 'web_search' }];

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: toolDefs
    });

    let usedWebSearch = response.content.some(b => b.type === 'server_tool_use' || b.type === 'web_search_tool_result');

    const eventResult = await pool.query(
      `INSERT INTO events (event_type, raw_content) VALUES ('chat', $1) RETURNING id`,
      [message]
    );
    const eventId = eventResult.rows[0].id;

    let newFactIds = [];
    let loopCount = 0;

    while (response.stop_reason === 'tool_use' && loopCount < 5) {
      loopCount++;
      const clientToolUses = response.content.filter(b => b.type === 'tool_use' && b.name === 'record_facts');
      if (clientToolUses.length === 0) break;

      const toolResultBlocks = [];
      for (const toolBlock of clientToolUses) {
        if (toolBlock.input && toolBlock.input.facts) {
          for (const fact of toolBlock.input.facts) {
            const { rows } = await pool.query(
              `INSERT INTO user_facts (category, content, confidence, source_event_id, domain)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [fact.category, fact.content, fact.confidence, eventId, fact.domain || 'general']
            );
            newFactIds.push(rows[0].id);
          }
        }
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: 'Facts recorded.'
        });
      }

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResultBlocks }
      ];

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: toolDefs
      });

      if (response.content.some(b => b.type === 'server_tool_use' || b.type === 'web_search_tool_result')) {
        usedWebSearch = true;
      }
    }

    if (newFactIds.length > 0) {
      await pool.query(`UPDATE events SET extracted_fact_ids = $1 WHERE id = $2`, [newFactIds, eventId]);
    }

    const textBlocks = response.content.filter(b => b.type === 'text');
    const replyText = textBlocks.length > 0 ? textBlocks.map(b => b.text).join('\n\n') : "Got it - noted.";

    let convId = conversationId;
    if (!convId) {
      const title = message.length > 50 ? message.slice(0, 50) + '...' : message;
      const convResult = await pool.query(
        `INSERT INTO conversations (title) VALUES ($1) RETURNING id`,
        [title]
      );
      convId = convResult.rows[0].id;
    }

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [convId, message]
    );
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [convId, replyText]
    );
    await pool.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [convId]);

    res.json({ reply: replyText, factsLearned: newFactIds.length, conversationId: convId, usedWebSearch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/facts', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, category, domain, content, confidence, first_seen FROM user_facts
     WHERE superseded_by IS NULL ORDER BY category, confidence DESC`
  );
  res.json(rows);
});

app.delete('/api/facts/:id', async (req, res) => {
  await pool.query(`DELETE FROM user_facts WHERE id = $1`, [req.params.id]);
  res.json({ deleted: true });
});

app.post('/api/decisions', async (req, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !options) return res.status(400).json({ error: 'question and options are required' });
    const { rows } = await pool.query(
      `INSERT INTO decisions (question, options) VALUES ($1, $2) RETURNING *`,
      [question, JSON.stringify(options)]
    );
    await pool.query(
      `INSERT INTO events (event_type, raw_content) VALUES ('decision', $1)`,
      [`Decision logged: ${question}`]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/decisions', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM decisions ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.patch('/api/decisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { chosen, outcome_notes } = req.body;

    if (chosen !== undefined) {
      await pool.query(
        `UPDATE decisions SET chosen = $1, decided_at = now() WHERE id = $2`,
        [chosen, id]
      );
    }
    if (outcome_notes !== undefined) {
      await pool.query(
        `UPDATE decisions SET outcome_notes = $1, outcome_reported_at = now() WHERE id = $2`,
        [outcome_notes, id]
      );
      await pool.query(
        `INSERT INTO events (event_type, raw_content) VALUES ('outcome', $1)`,
        [`Outcome reported for decision ${id}: ${outcome_notes}`]
      );
    }

    const { rows } = await pool.query(`SELECT * FROM decisions WHERE id = $1`, [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

const AI_ON_IT_URL = 'https://v0-vodo-ai-app.vercel.app';
const AI_ON_IT_USER_ID = '1781756680827';
const WORKOUT_LIST_ID = '1782765958454';
const DEOS_LIST_ID = '1781772086425';

app.post('/api/push-to-ai-on-it', async (req, res) => {
  try {
    const { title, domain } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const listId = domain === 'health' ? WORKOUT_LIST_ID : DEOS_LIST_ID;
    const taskId = Date.now().toString() + Math.random();
    const taskData = {
      id: taskId,
      title,
      category: '',
      categoryEmoji: '',
      completed: false,
      starred: false,
      createdAt: new Date().toISOString(),
      notes: 'Pushed from Deos',
      dueDate: null,
      priority: null,
      label: '',
      subtasks: []
    };

    const resp = await fetch(`${AI_ON_IT_URL}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_task',
        userId: AI_ON_IT_USER_ID,
        data: { id: taskId, listId, taskData }
      })
    });

    const result = await resp.json();
    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/log-exercise', async (req, res) => {
  try {
    const getRes = await fetch(`${AI_ON_IT_URL}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_habits', userId: AI_ON_IT_USER_ID })
    });
    const getData = await getRes.json();
    const habits = getData.habits;

    if (!habits) return res.status(404).json({ error: 'No habits found for user' });

    const today = new Date().toISOString().split('T')[0];
    let found = false;

    const updated = habits.map(h => {
      const isExercise = h.name.toLowerCase().includes('exercise') || h.icon === '💪';
      if (isExercise) {
        found = true;
        if (!h.completedDates.includes(today)) {
          return { ...h, completedDates: [...h.completedDates, today] };
        }
      }
      return h;
    });

    if (!found) return res.status(404).json({ error: 'No Exercise habit found' });

    const saveRes = await fetch(`${AI_ON_IT_URL}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_habits', userId: AI_ON_IT_USER_ID, data: { habits: updated } })
    });
    const saveData = await saveRes.json();

    res.json({ ok: true, alreadyLoggedToday: !found, result: saveData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Deos backend running on port ${PORT}`));
