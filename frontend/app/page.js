'use client';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, Christian';
  if (hour < 18) return 'Good afternoon, Christian';
  return 'Good evening, Christian';
}

export default function Home() {
  const [tab, setTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [facts, setFacts] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState('');
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardData, setOnboardData] = useState({ age: '', nationality: '', gender: '', location: '', height: '', weight: '', occupation: '' });

  const API = process.env.NEXT_PUBLIC_API_URL;

  const loadFacts = async () => {
    try {
      const res = await fetch(`${API}/api/facts`);
      const data = await res.json();
      setFacts(data);
      if (data.length === 0 && !localStorage.getItem('onboarding-dismissed')) {
        setShowOnboarding(true);
      }
    } catch (err) {
      setFacts([]);
    }
  };

  const submitOnboarding = async () => {
    try {
      await fetch(`${API}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardData)
      });
      localStorage.setItem('onboarding-dismissed', 'true');
      setShowOnboarding(false);
      loadFacts();
    } catch (err) {}
  };

  const skipOnboarding = () => {
    localStorage.setItem('onboarding-dismissed', 'true');
    setShowOnboarding(false);
  };

  const loadDecisions = async () => {
    try {
      const res = await fetch(`${API}/api/decisions`);
      const data = await res.json();
      setDecisions(data);
    } catch (err) {
      setDecisions([]);
    }
  };

  const createDecision = async () => {
    if (!newQuestion.trim() || !newOptions.trim()) return;
    const options = newOptions.split(',').map(o => o.trim()).filter(Boolean);
    try {
      await fetch(`${API}/api/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion, options })
      });
      setNewQuestion('');
      setNewOptions('');
      loadDecisions();
    } catch (err) {}
  };

  const chooseOption = async (id, chosen) => {
    try {
      await fetch(`${API}/api/decisions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosen })
      });
      loadDecisions();
    } catch (err) {}
  };

  const reportOutcome = async (id) => {
    const outcome_notes = outcomeDrafts[id];
    if (!outcome_notes || !outcome_notes.trim()) return;
    try {
      await fetch(`${API}/api/decisions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome_notes })
      });
      loadDecisions();
    } catch (err) {}
  };

  const loadConversations = async () => {
    try {
      const res = await fetch(`${API}/api/conversations`);
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      setConversations([]);
    }
  };

  const openConversation = async (id) => {
    try {
      const res = await fetch(`${API}/api/conversations/${id}/messages`);
      const data = await res.json();
      setMessages(data.map(m => ({ role: m.role, text: m.content })));
      setConversationId(id);
      setSidebarOpen(false);
      setTab('chat');
    } catch (err) {}
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setSidebarOpen(false);
    setTab('chat');
  };

  useEffect(() => { loadFacts(); loadDecisions(); loadConversations(); }, []);

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
        body: JSON.stringify({ message: userMsg.text, conversationId })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'No reply.', usedWebSearch: data.usedWebSearch, factsLearned: data.factsLearned }]);
      if (data.conversationId) setConversationId(data.conversationId);
      loadFacts();
      loadConversations();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error reaching Deos backend.' }]);
    }
    setLoading(false);
  };

  const pushToAiOnIt = async (title, domain) => {
    try {
      const res = await fetch(`${API}/api/push-to-ai-on-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, domain })
      });
      const data = await res.json();
      if (data.ok) alert('Sent to AI ON IT');
    } catch (err) {}
  };

  const deleteFact = async (id) => {
    try {
      await fetch(`${API}/api/facts/${id}`, { method: 'DELETE' });
      loadFacts();
    } catch (err) {}
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-md flex flex-col h-[100dvh] max-h-[100dvh] pb-4">

        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center text-neutral-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <h1 className="text-lg font-medium flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-medium">D</span>
            {greeting()}
          </h1>
          <button onClick={startNewChat} className="w-8 h-8 flex items-center justify-center text-neutral-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        {showOnboarding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-4 max-h-[85vh] overflow-y-auto">
              <h2 className="text-base font-medium mb-1">Tell Deos about yourself</h2>
              <p className="text-xs text-neutral-500 mb-4">Optional, but helps Deos give grounded advice from day one.</p>

              {[
                { key: 'age', placeholder: 'Age' },
                { key: 'nationality', placeholder: 'Nationality' },
                { key: 'gender', placeholder: 'Gender' },
                { key: 'location', placeholder: 'Where are you based?' },
                { key: 'height', placeholder: 'Height' },
                { key: 'weight', placeholder: 'Weight' },
                { key: 'occupation', placeholder: 'Occupation' }
              ].map(field => (
                <input
                  key={field.key}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm outline-none mb-2 placeholder-neutral-600"
                  placeholder={field.placeholder}
                  value={onboardData[field.key]}
                  onChange={e => setOnboardData(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              ))}

              <div className="flex gap-2 mt-3">
                <button onClick={skipOnboarding} className="flex-1 text-sm px-3 py-2 rounded-md bg-neutral-800 text-neutral-400">Skip</button>
                <button onClick={submitOnboarding} className="flex-1 text-sm px-3 py-2 rounded-md bg-indigo-500/20 text-indigo-300">Save</button>
              </div>
            </div>
          </div>
        )}

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="w-72 bg-neutral-900 border-r border-neutral-800 h-full overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Conversations</span>
                <button onClick={() => setSidebarOpen(false)} className="text-neutral-500 text-sm">✕</button>
              </div>
              <button onClick={startNewChat} className="w-full text-left text-sm px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 mb-3">
                + New chat
              </button>
              <div className="flex flex-col gap-1">
                {conversations.length === 0 && <p className="text-xs text-neutral-600 px-3">No conversations yet</p>}
                {conversations.map(c => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={`text-left text-sm px-3 py-2 rounded-lg truncate ${c.id === conversationId ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400'}`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)}></div>
          </div>
        )}

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
                  {m.role === 'assistant' ? (
                    <>
                      {(m.usedWebSearch || m.factsLearned > 0) && (
                        <div className="flex gap-2 mb-1.5">
                          {m.usedWebSearch && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">🔍 Searched the web</span>
                          )}
                          {m.factsLearned > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">📝 Noted {m.factsLearned} fact{m.factsLearned > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      )}
                      <div className="prose-chat">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                    </>
                  ) : m.text}
                </div>
              ))}
              {loading && <div className="self-start text-neutral-500 text-sm">Deos is thinking...</div>}
            </div>

            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-2 flex-shrink-0">
              <input
                className="flex-1 min-w-0 bg-transparent outline-none text-base px-2"
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
                <div className="flex items-center gap-2">
                  <button onClick={() => pushToAiOnIt(f.content, f.domain)} className="text-indigo-400 text-xs px-2 whitespace-nowrap">→ AI ON IT</button>
                  <button onClick={() => deleteFact(f.id)} className="text-neutral-600 text-xs px-2">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'decisions' && (
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <input
                className="w-full bg-transparent outline-none text-sm mb-2 placeholder-neutral-600"
                placeholder="What are you deciding?"
                value={newQuestion}
                onChange={e => setNewQuestion(e.target.value)}
              />
              <input
                className="w-full bg-transparent outline-none text-sm mb-2 placeholder-neutral-600"
                placeholder="Options, comma separated"
                value={newOptions}
                onChange={e => setNewOptions(e.target.value)}
              />
              <button
                onClick={createDecision}
                className="text-xs px-3 py-1.5 rounded-md bg-indigo-500/20 text-indigo-300"
              >Log decision</button>
            </div>

            {decisions.length === 0 && <p className="text-sm text-neutral-500">No decisions logged yet.</p>}

            {decisions.map(d => (
              <div key={d.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                <p className="text-sm mb-2">{d.question}</p>

                {!d.chosen && (
                  <div className="flex gap-2 flex-wrap">
                    {(typeof d.options === 'string' ? JSON.parse(d.options) : d.options).map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => chooseOption(d.id, opt)}
                        className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300"
                      >{opt}</button>
                    ))}
                  </div>
                )}

                {d.chosen && !d.outcome_notes && (
                  <div>
                    <p className="text-xs text-indigo-400 mb-2">Chose: {d.chosen}</p>
                    <input
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-sm outline-none mb-2 placeholder-neutral-600"
                      placeholder="How did it go?"
                      value={outcomeDrafts[d.id] || ''}
                      onChange={e => setOutcomeDrafts(prev => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => reportOutcome(d.id)}
                      className="text-xs px-3 py-1.5 rounded-md bg-indigo-500/20 text-indigo-300"
                    >Save outcome</button>
                  </div>
                )}

                {d.chosen && d.outcome_notes && (
                  <div>
                    <p className="text-xs text-indigo-400">Chose: {d.chosen}</p>
                    <p className="text-xs text-neutral-500 mt-1">Outcome: {d.outcome_notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-around pt-3 mt-3 border-t border-neutral-800 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
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
