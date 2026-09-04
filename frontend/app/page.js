'use client';
import { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error reaching Deos backend.' }]);
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-medium mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm">D</span>
          Deos
        </h1>
        <div className="flex flex-col gap-3 mb-4 min-h-[300px]">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
              m.role === 'user'
                ? 'self-end bg-indigo-500/20 text-indigo-100 rounded-br-sm'
                : 'self-start bg-neutral-900 border border-neutral-800 rounded-bl-sm'
            }`}>
              {m.text}
            </div>
          ))}
          {loading && <div className="self-start text-neutral-500 text-sm">Deos is thinking...</div>}
        </div>
        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-2">
          <input
            className="flex-1 bg-transparent outline-none text-sm px-2"
            placeholder="Ask Deos anything"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button onClick={send} className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-sm">↑</button>
        </div>
      </div>
    </main>
  );
}
