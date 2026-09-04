'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [tab, setTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [facts, setFacts] = useState([]);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const loadFacts = async () => {
    try {
      const res = await fetch(`${API}/api/facts`);
      const data = await res.json();
      setFacts(data);
    } catch (err) {
      setFacts([]);
    }
  };

  useEffect(() => { loadFacts(); }, []);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'No reply.' }]);
      loadFacts();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error reaching Deos backend.' }]);
    }
    setLoading(false);
  };

  const deleteFact = async (id) => {
    try {
      await fetch(`${API}/api/facts/${id}`, { method: 'DELETE' });
      loadFacts();
    } catch (err) {}
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-md flex flex-col" style={{ minHeight: '90vh' }}>

        <h1 className="text-lg font-medium mb-4 flex items-center gap-2 flex-shrink-0">
          <span className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-medium">D</span>
          Deos
        </h1>

        {tab === 'chat' && (
          <>
            <div className="flex gap-2 overflow-x-auto mb-4 pb-1 flex-shrink-0">
              {facts.length === 0 && (
                <span className="text-xs px-3 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-500 whitespace-nowrap">
                  No facts learned yet
                </span>
              )}
              {facts.slice(0, 6).map(f => (
                <span key={f.id} className="text-xs px-3 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-400 whitespace-nowrap">
                  {f.content} <span className="opacity-60">{Math.round(f.confidence * 100)}%</span>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-3 mb-4 flex-1 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'self-end bg-indigo-500/20 text-indigo-100 rounded-br-sm'
                    : 'self-start bg-neutral-900 border border-neutral-800 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              ))}
              {loading && <div className="self-start text-neutral-500 text-sm">Deos is thinking...</div>}
            </div>

            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-2 flex-shrink-0">
              <input
                className="flex-1 min-w-0 bg-transparent outline-none text-sm px-2"
                placeholder="Ask Deos anything"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
              />
              <button
                onClick={send}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-sm"
              >↑</button>
            </div>
          </>
        )}

        {tab === 'self-model' && (
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
            {facts.length === 0 && <p className="text-sm text-neutral-500">Nothing learned yet — start chatting.</p>}
            {facts.map(f => (
              <div key={f.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm">{f.content}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{f.category} · {Math.round(f.confidence * 100)}% confidence</p>
                </div>
                <button onClick={() => deleteFact(f.id)} className="text-neutral-600 text-xs px-2">✕</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'decisions' && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-neutral-500">Decisions log — coming next.</p>
          </div>
        )}

        <div className="flex justify-around pt-3 mt-3 border-t border-neutral-800 flex-shrink-0">
          <button onClick={() => setTab('chat')} className={`flex flex-col items-center gap-1 text-xs ${tab === 'chat' ? 'text-indigo-400' : 'text-neutral-500'}`}>
            <span>Chat</span>
          </button>
          <button onClick={() => setTab('self-model')} className={`flex flex-col items-center gap-1 text-xs ${tab === 'self-model' ? 'text-indigo-400' : 'text-neutral-500'}`}>
            <span>Self-model</span>
          </button>
          <button onClick={() => setTab('decisions')} className={`flex flex-col items-center gap-1 text-xs ${tab === 'decisions' ? 'text-indigo-400' : 'text-neutral-500'}`}>
            <span>Decisions</span>
          </button>
        </div>

      </div>
    </main>
  );
}
