'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Play, Square, ChevronDown, ChevronUp } from 'lucide-react';

interface Message {
  id: string;
  type: 'system' | 'trainee' | 'attendee';
  text: string;
  timestamp: string;
}

export default function HoneycombSimulator() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState('ICEBREAKER');
  const [loading, setLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  
  const [conferenceContext, setConferenceContext] = useState('');
  const [attendeeProfile, setAttendeeProfile] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [violations, setViolations] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleStartSession = async () => {
    if (!conferenceContext.trim() || !attendeeProfile.trim()) {
      alert('Please fill in conference context and attendee profile');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conferenceContext,
          attendeeProfile,
          difficulty
        })
      });
      
      const data = await response.json();
      setSessionId(data.sessionId);
      setMessages(data.transcript);
      setCurrentState(data.currentState);
      setViolations([]);
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;
    
    const userMessage = input;
    setInput('');
    setLoading(true);
    
    try {
      const response = await fetch(`/api/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      
      const data = await response.json();
      
      // Add both trainee and attendee messages
      setMessages(prev => [...prev, 
        {
          id: Date.now().toString(),
          type: 'trainee',
          text: userMessage,
          timestamp: new Date().toISOString()
        },
        data.message
      ]);
      
      setCurrentState(data.currentState);
      setViolations(data.violations || []);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId || loading) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: 'POST'
      });
      
      const data = await response.json();
      setMessages(prev => [...prev, data.feedback]);
      setSessionId(null);
    } catch (error) {
      console.error('Failed to end session:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Honeycomb Conference Simulator</h1>
          <p className="text-gray-400 text-sm mb-4">Practice discovery conversations with AI-powered attendees</p>
          
          {!sessionId && (
            <div className="bg-gray-800 rounded-lg p-4 mb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Conference Context</label>
                <input
                  type="text"
                  value={conferenceContext}
                  onChange={(e) => setConferenceContext(e.target.value)}
                  placeholder="e.g., KubeCon booth, Tuesday afternoon"
                  className="w-full bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hidden Attendee Profile (Secret)</label>
                <textarea
                  value={attendeeProfile}
                  onChange={(e) => setAttendeeProfile(e.target.value)}
                  placeholder="e.g., Backend engineer, 5 years exp, using Datadog, frustrated with correlation, OTel: AWARE"
                  className="w-full bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="easy">Easy - More forgiving</option>
                  <option value="medium">Medium - Realistic</option>
                  <option value="hard">Hard - Very guarded</option>
                </select>
              </div>
            </div>
          )}
          
          <div className="flex gap-3 items-center">
            <button
              onClick={handleStartSession}
              disabled={!!sessionId || loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Play size={18} />
              Start Session
            </button>
            <button
              onClick={handleEndSession}
              disabled={!sessionId || loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Square size={18} />
              End Session
            </button>
            
            {sessionId && (
              <div className="flex items-center gap-3 ml-auto">
                <div className="text-sm">
                  <span className="text-gray-400">State:</span>{' '}
                  <span className="font-medium text-indigo-300">{currentState}</span>
                </div>
                <span className="px-3 py-2 rounded-lg text-sm font-medium bg-green-900 text-green-200">
                  ● Active
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-xl mb-4 h-96 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Configure session and click Start to begin
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.type === 'trainee' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.type === 'system'
                        ? 'bg-blue-900 text-blue-200 mx-auto text-sm whitespace-pre-line'
                        : msg.type === 'trainee'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <div className="text-xs font-medium mb-1 opacity-80">
                      {msg.type === 'system' ? '🤖 System' : msg.type === 'trainee' ? '👤 You' : '🎭 Attendee'}
                    </div>
                    <div>{msg.text}</div>
                    <div className="text-xs opacity-60 mt-1">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={sessionId ? 'Your response...' : "Start a session to begin"}
              disabled={!sessionId || loading}
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendMessage}
              disabled={!sessionId || !input.trim() || loading}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              <Send size={18} />
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className="w-full px-4 py-3 bg-gray-750 hover:bg-gray-700 transition-colors flex items-center justify-between text-sm font-medium text-gray-400"
          >
            <span>🔧 Debug Panel</span>
            {debugOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          
          {debugOpen && (
            <div className="p-4 font-mono text-xs space-y-3">
              <div className="text-green-400">Session State:</div>
              <div className="pl-4 space-y-1 text-gray-300">
                <div>sessionId: <span className="text-yellow-400">{sessionId || 'null'}</span></div>
                <div>currentState: <span className="text-yellow-400">"{currentState}"</span></div>
                <div>messageCount: <span className="text-yellow-400">{messages.length}</span></div>
                <div>violations: <span className="text-red-400">{violations.length}</span></div>
              </div>
              
              <div className="text-green-400">Violations:</div>
              <div className="pl-4 text-red-400">
                {violations.length === 0 ? (
                  <div className="text-gray-500">None</div>
                ) : (
                  violations.map((v, i) => <div key={i}>• {v}</div>)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}