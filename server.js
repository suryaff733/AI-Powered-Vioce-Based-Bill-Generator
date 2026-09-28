const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all incoming connections
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Supabase client initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://qqrkldffbxzshxwyfduc.supabase.co";
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_LvRsojfIygXoCy_HKu7Drw_GlrdM-Ph";
const supabase = createClient(supabaseUrl, supabaseKey);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Helper: Sanitize & Standardize Bill
function sanitizeBill(b) {
  if (!b || typeof b !== 'object') return null;
  const rawNo = b.no !== undefined && b.no !== null ? String(b.no).trim() : '';
  const numOnly = parseInt(rawNo.replace(/\D/g, ''), 10);
  const no = !isNaN(numOnly) && numOnly > 0 ? String(numOnly).padStart(3, '0') : (rawNo || '001');
  const type = b.type ? String(b.type).toLowerCase().trim() : 'gst';
  const id = b.id ? String(b.id).trim() : `${type}_${no}`;

  return {
    ...b,
    id,
    type,
    no,
    updatedAt: new Date().toISOString(),
  };
}

function formatBillForSupabase(b) {
  const clean = sanitizeBill(b);
  if (!clean) return null;
  return {
    id: clean.id,
    type: clean.type,
    no: clean.no,
    date: clean.date || '',
    cname: clean.cname || '',
    grand: clean.grand || 0,
    data: clean,
    updated_at: new Date().toISOString(),
  };
}

// 1. GET /api/bills
app.get('/api/bills', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('data')
      .order('date', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const bills = (data || []).map(d => d.data).filter(Boolean);
    res.json({ success: true, bills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. POST /api/bills
app.post('/api/bills', async (req, res) => {
  try {
    const body = req.body;

    if (body && !Array.isArray(body) && (body.no !== undefined || body.id !== undefined)) {
      const row = formatBillForSupabase(body);
      if (!row) return res.status(400).json({ error: 'Invalid bill payload' });

      const { error } = await supabase.from('bills').upsert(row, { onConflict: 'id' });
      if (error) throw error;

      const { data } = await supabase.from('bills').select('data').order('date', { ascending: false });
      return res.json({ success: true, bills: (data || []).map(d => d.data) });
    }

    const incomingBills = Array.isArray(body) ? body : body.bills;
    if (Array.isArray(incomingBills)) {
      const rows = incomingBills.map(formatBillForSupabase).filter(Boolean);
      if (rows.length > 0) {
        const { error } = await supabase.from('bills').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      const { data } = await supabase.from('bills').select('data').order('date', { ascending: false });
      return res.json({ success: true, bills: (data || []).map(d => d.data) });
    }

    res.status(400).json({ error: 'Invalid payload' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. DELETE /api/bills
app.delete('/api/bills', async (req, res) => {
  try {
    const { no, type, id } = req.query;
    let targetId = id;
    if (!targetId && no && type) targetId = `${type}_${no}`;

    if (targetId) {
      await supabase.from('bills').delete().eq('id', targetId);
    } else if (no) {
      await supabase.from('bills').delete().eq('no', no);
    } else {
      return res.status(400).json({ error: 'Missing bill identifier' });
    }

    const { data } = await supabase.from('bills').select('data').order('date', { ascending: false });
    res.json({ success: true, bills: (data || []).map(d => d.data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /api/parse-voice
app.post('/api/parse-voice', async (req, res) => {
  try {
    const { transcript, currentState, currentContext } = req.body;
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'Transcript is empty' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    const systemPrompt = `You are the Conversational AI Billing Assistant for SVS Electrical & Mechanical Works, Hyderabad.
Active Dialog State: "${currentState}"
Current Session Context Data: ${JSON.stringify(currentContext)}
User Spoken Transcript: "${transcript}"

Parse Telugu or English voice transcription into structured billing commands and feedback.
Return EXACTLY a JSON response:
{
  "value": string | boolean | null,
  "intent": "NEXT" | "PREVIOUS" | "REPEAT" | "CORRECT" | "COMMAND",
  "command": { "type": string, "data": object } | null,
  "corrections": object,
  "teFeedback": string
}`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'Gemini API call failed' });
    }

    const resData = await response.json();
    const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(resultText.trim().replace(/^```json\s*/i, '').replace(/```$/, ''));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SVS Billing Standalone Server running on port ${PORT}`);
});
