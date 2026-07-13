import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Input, TextField, Label, Tooltip, TooltipTrigger } from 'react-aria-components';
import {
  Microphone01 as Mic,
  MicrophoneOff01 as MicOff,
  Send01 as Send,
  CpuChip02 as Cpu,
  Globe03 as Globe,
  VolumeMax as Volume2,
  RefreshCcw01 as Refresh,
} from '@untitledui/icons';
import Orb from './components/Orb';
import AgentOverlay from './components/AgentOverlay';

const API_BASE = 'http://127.0.0.1:8000';

const modelMeta = {
  groq: { label: 'Groq', tone: 'Fast routing' },
  llama: { label: 'Llama 3.3', tone: 'High reasoning' },
  'llama-3.3-70b-versatile': { label: 'Llama 3.3 70B', tone: 'High reasoning' },
  'llama-3.1-8b-instant': { label: 'Llama 3.1 8B', tone: 'Quick responses' },
};

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createMessage(role, content, model) {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
    ...(model ? { model } : {}),
  };
}

function extractPayloads(buffer) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() || '';
  const payloads = [];

  for (const frame of frames) {
    const line = frame.split('\n').find((entry) => entry.startsWith('data: '));
    if (!line) {
      continue;
    }
    try {
      payloads.push(JSON.parse(line.slice(6)));
    } catch {
      // Ignore malformed SSE fragments and wait for the next clean chunk.
    }
  }

  return { payloads, remainder };
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [orbState, setOrbState] = useState('idle');
  const [model, setModel] = useState('groq');
  const [streamModel, setStreamModel] = useState('groq');
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [processedRequestIds, setProcessedRequestIds] = useState(new Set());
  const [lastUserInput, setLastUserInput] = useState('');
  const [lastResponseTime, setLastResponseTime] = useState(0);
  const [agentSteps, setAgentSteps] = useState([]);   // live agent step log
  const [agentVisible, setAgentVisible] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/settings`)
      .then(res => res.json())
      .then(data => setIsMuted(data.muted))
      .catch(() => { });
  }, []);

  const chatRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const deferredStreamText = useDeferredValue(streamText);

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:8000/ws');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Orb / UI state updates
        if (data.state) {
          setOrbState(data.state);
        }

        // Committed chat messages from server (wake-word loop)
        if (data.type === 'chat') {
          appendMessage(createMessage(data.role || 'assistant', data.text, 'groq'));
        }

        // System fully online — idle state (no greeting on startup)
        if (data.type === 'system_ready') {
          setOrbState('idle');
          setTranscript('');
        }

        // Wake word detected — snap orb to listening state immediately
        if (data.type === 'wake_word_detected') {
          setOrbState('listening');
          setTranscript('\u25cf Listening...');
        }

        // Live partial transcription from wake word STT session
        // Shown as growing text in the transcript bar as user speaks
        if (data.type === 'transcript_chunk') {
          setOrbState('listening');
          setTranscript(data.text);
        }

        // Final blob upload: partial live update (mic button flow)
        if (data.type === 'transcript') {
          setTranscript(data.text);
        }

        // Final transcription confirmed — append as user message bubble
        if (data.type === 'transcript_final') {
          setTranscript('');
          appendMessage(createMessage('user', data.text));
        }

        // Wake word loop: command committed — show it as a chat bubble
        if (data.type === 'user_message') {
          setTranscript('');           // Clear the live transcript bar
          appendMessage(createMessage('user', data.text));
          setOrbState('thinking');     // Immediately show thinking state
        }

        // External action completed — bring app window to front
        if (data.action === 'focus_window') {
          try { window.electronAPI?.focus?.(); } catch (_) {}
        }

        // Autonomous agent step events — drive the overlay
        if (data.type === 'agent_step') {
          setAgentVisible(true);
          setAgentSteps((prev) => {
            // Update the last entry if it's the same step + command (result came in)
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (last.step === data.step && last.action === data.action && data.result !== 'executing...') {
                return [...prev.slice(0, -1), data];
              }
            }
            return [...prev, data];
          });
          // Auto-hide overlay 3s after completion
          if (data.status === 'done' || data.status === 'stopped') {
            setTimeout(() => setAgentVisible(false), 3000);
            setTimeout(() => setAgentSteps([]), 3500);
          }
        }
      } catch {
        // Ignore transient websocket payload issues.
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    chatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, deferredStreamText, transcript]);

  const activeModel = modelMeta[streamModel] ?? modelMeta[model] ?? modelMeta.groq;

  const appendMessage = (message) => {
    startTransition(() => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === message.role && last?.content === message.content) return prev;
        return [...prev, message];
      });
    });
  };

  const consumeAssistantStream = async (response, options = {}) => {
    if (!response.ok) {
      throw new Error(`server_error_${response.status}`);
    }
    const { addTranscribedUser = false } = options;
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Missing response stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    let activeModelName = streamModel;
    let userTranscriptAdded = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { payloads, remainder } = extractPayloads(buffer);
      buffer = remainder;

      for (const payload of payloads) {
        if (payload.model) {
          activeModelName = payload.model;
          setModel(payload.model);
          setStreamModel(payload.model);
        }

        if (payload.transcribed) {
          setTranscript(payload.transcribed);
          if (addTranscribedUser && !userTranscriptAdded) {
            appendMessage(createMessage('user', payload.transcribed));
            userTranscriptAdded = true;
          }
        }

        if (payload.error) {
          setStreamText('');
          setTranscript('');
          setIsThinking(false);
          // Throw so the outer catch handles it — prevents duplicate messages
          throw new Error(payload.error || 'backend_error');
        }

        if (payload.text !== undefined) {
          assistantText = payload.text;
          setStreamText(assistantText);
        }

        if (payload.done) {
          if (assistantText) {
            appendMessage(createMessage('assistant', assistantText, activeModelName));
          }
          setStreamText('');
          setTranscript('');
          setIsThinking(false);
        }
      }
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    const now = Date.now();

    // STEP 1 & 2: INPUT FILTER + PROCESS LOCK
    if (!trimmed || isProcessing || (trimmed === lastUserInput && now - lastRequestTime < 3000)) {
      return;
    }

    setIsProcessing(true);
    setLastRequestTime(now);
    setLastUserInput(trimmed);

    // FIX 4: Request ID
    const requestId = `req_${now}_${Math.random().toString(36).substr(2, 9)}`;
    
    appendMessage(createMessage('user', trimmed));
    setInput('');
    setTranscript('');
    setStreamText('');
    setStreamModel(model);
    setIsThinking(true);
    setOrbState('thinking');

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, id: requestId }),
      });

      // STEP 3: SINGLE RESPONSE GUARD
      const responseNow = Date.now();
      if (responseNow - lastResponseTime < 2000) {
        console.log("Response ignored due to 2s guard");
        return;
      }
      setLastResponseTime(responseNow);

      await consumeAssistantStream(response);
    } catch (err) {
      setIsThinking(false);
      setOrbState('idle');
      const msg = err?.message?.startsWith('server_error')
        ? "I encountered an issue with the link to my brain, sir." 
        : "Slight hiccup there, sir. I couldn't complete that request.";
      appendMessage(createMessage('assistant', msg, 'groq'));
    } finally {
      // STEP 5: RESET
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setIsRecording(true);
      setTranscript('');
      setOrbState('listening');

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const now = Date.now();
        if (isProcessing) {
          stream.getTracks().forEach((t) => t.stop());
          setIsRecording(false);
          setOrbState('idle');
          return;
        }

        setIsProcessing(true);
        setLastRequestTime(now);
        setIsThinking(true);
        setOrbState('thinking');

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        // Show a placeholder while Whisper processes
        setTranscript('Transcribing...');

        const requestId = `req_voice_${now}_${Math.random().toString(36).substr(2, 9)}`;
        const form = new FormData();
        form.append('audio', blob, 'voice.webm');
        form.append('id', requestId);

        try {
          const response = await fetch(`${API_BASE}/voice`, {
            method: 'POST',
            body: form,
          });

          setLastResponseTime(Date.now());
          // addTranscribedUser is FALSE here — the WebSocket transcript_final event
          // already added the user bubble, so we avoid duplicates.
          await consumeAssistantStream(response);
        } catch (err) {
          setIsThinking(false);
          setOrbState('idle');
          setTranscript('');
          
          let msg = "Microphone upload failed, sir. Please try again.";
          if (err?.message === 'backend_error' || err?.message === 'Already listening' || err?.message?.startsWith('server_error')) {
             msg = "I wasn't able to process that correctly, sir.";
          }
          if (err?.message === 'Already listening') {
             msg = "I am already listening, sir.";
          }
          appendMessage(createMessage('assistant', msg, 'groq'));
        } finally {
          setIsProcessing(false);
        }
      };

      // Gather audio in 250ms chunks for smoother blob
      recorder.start(250);
    } catch (e) {
      console.error('Mic access error:', e);
      setOrbState('idle');
      appendMessage(createMessage('assistant', 'Microphone access was denied, sir. Please allow it in your system settings.', 'groq'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    // recognitionRef is no longer used, but keep guard for safety
    if (recognitionRef.current) {
      recognitionRef.current = null;
    }
  };

  // Send a pre-transcribed text directly to the LLM (used by wake word loop via WS)
  const sendMessageWithText = async (text) => {
    const now = Date.now();
    if (!text || isProcessing) return;

    setIsProcessing(true);
    setLastRequestTime(now);
    setLastUserInput(text);

    const requestId = `req_text_${now}_${Math.random().toString(36).substr(2, 9)}`;
    appendMessage(createMessage('user', text));
    setInput('');
    setIsThinking(true);
    setOrbState('thinking');

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, id: requestId }),
      });
      setLastResponseTime(Date.now());
      await consumeAssistantStream(response);
    } catch {
      setIsThinking(false);
      setOrbState('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleMute = async () => {
    try {
      const response = await fetch(`${API_BASE}/toggle-mute`, { method: 'POST' });
      const data = await response.json();
      setIsMuted(data.muted);
    } catch (e) {
      console.error("Mute toggle failed", e);
    }
  };

  const refreshChat = () => {
    setMessages([]);
    setTranscript('');
    setStreamText('');
    setIsThinking(false);
  };

  const stopAgent = async () => {
    try {
      await fetch(`${API_BASE}/agent/stop`, { method: 'POST' });
    } catch (e) {
      console.error('Agent stop failed', e);
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#04070d] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,170,255,0.18),transparent_30%),linear-gradient(180deg,#04070d_0%,#03050a_100%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]" />

      {/* Agent overlay — floats above everything, bottom-right */}
      <AgentOverlay steps={agentSteps} onStop={stopAgent} visible={agentVisible} />

      <div className="relative flex h-full flex-row">
        <aside className="relative flex shrink-0 w-[300px] xl:w-[420px] flex-col border-r border-white/10 bg-black/30 p-6 backdrop-blur-2xl h-full overflow-y-auto custom-scrollbar max-h-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">JARVIS CORE</div>
              <h1 className="mt-2 text-2xl font-semibold text-white">Consciousness Interface</h1>
            </div>

          </div>

          <div className="relative flex flex-1 items-center justify-center py-8">
            <Orb
              state={orbState}
              speaking={Boolean(deferredStreamText) || orbState === 'talking'}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard icon={<Globe className="h-4 w-4" />} label="Router" value={activeModel.label} active={streamModel === 'groq'} />
            <StatCard icon={<Cpu className="h-4 w-4" />} label="Mode" value={orbState.toUpperCase()} active={orbState !== 'idle'} />
            <StatCard icon={<Volume2 className="h-4 w-4" />} label="Voice" value="Pocket TTS" active={!isMuted} />
            <StatCard icon={<span className="text-cyan-300">+</span>} label="Latency" value={deferredStreamText ? 'Paced stream' : 'Live stream'} active={!!deferredStreamText} />
          </div>
        </aside>

        <main className="relative flex h-full flex-1 min-w-0 flex-col overflow-hidden">
          <header className="[-webkit-app-region:drag] flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur-2xl">
            <div className="flex items-center gap-3 [-webkit-app-region:no-drag]">
              <Button
                onPress={refreshChat}
                className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 transition hover:border-cyan-500/50 hover:bg-white/10 hover:text-cyan-300"
              >
                <Refresh className="h-3 w-3 transition-transform group-hover:rotate-180" />
                Refresh Chat
              </Button>

              <Button
                onPress={toggleMute}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase transition ${isMuted
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                  }`}
              >
                {isMuted ? <MicOff className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {isMuted ? 'Muted' : 'Voice On'}
              </Button>
            </div>


          </header>

          <section className="relative flex-1 overflow-y-auto px-4 py-8 custom-scrollbar scroll-smooth">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-32">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.article
                    key={message.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[2rem] border px-6 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-3xl transition-all ${message.role === 'user'
                        ? 'border-white/10 bg-white/5 text-slate-100'
                        : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-50 shadow-[0_0_40px_rgba(0,212,255,0.05)]'
                        }`}
                    >
                      <div className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.35em] ${message.role === 'user' ? 'text-white/40' : 'text-cyan-400/80'
                        }`}>
                        <span>{message.role === 'user' ? 'USER' : 'JARVIS'}</span>
                        {message.model && <span className="opacity-50">&bull; {modelMeta[message.model]?.label ?? message.model}</span>}
                        <span className="opacity-50">&bull; {timeLabel(message.timestamp)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed tracking-wide">{message.content}</p>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {/* Status text moved into the Orb */}
                {deferredStreamText && (
                  <motion.article initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-start">
                    <div className="max-w-[85%] rounded-[2rem] border border-cyan-500/30 bg-cyan-500/15 px-6 py-4 text-cyan-50 shadow-[0_0_50px_rgba(0,212,255,0.1)] backdrop-blur-3xl">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-400">
                        <span>JARVIS</span>
                        <span>&bull; {activeModel.label}</span>
                        <span className="flex items-center gap-1">
                          &bull; <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" /> LIVE
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed tracking-wide">
                        {deferredStreamText}
                        <span className="ml-1 inline-block h-4 w-[2.5px] animate-pulse bg-cyan-300 align-middle" />
                      </p>
                    </div>
                  </motion.article>
                )}
              </AnimatePresence>
              <div ref={chatRef} />
            </div>
          </section>

          <footer className="border-t border-white/10 bg-black/30 px-4 py-4 backdrop-blur-2xl lg:px-8">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_0_60px_rgba(0,170,255,0.08)]">
                <div className="flex items-end gap-3">
                  <TextField className="flex-1">
                    <Label className="sr-only">Message</Label>
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Ask for a search, a command, or a deep explanation..."
                      className="h-12 w-full rounded-2xl border border-white/10 bg-transparent px-4 text-[15px] text-white outline-none placeholder:text-white/25"
                    />
                  </TextField>

                  <TooltipTrigger>
                    <Button
                      onPress={isRecording ? stopRecording : startRecording}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                        isRecording
                          ? 'border-green-400/40 bg-green-500/20 text-green-200 shadow-[0_0_25px_rgba(34,197,94,0.25)]'
                          : isThinking
                          ? 'border-yellow-400/40 bg-yellow-500/20 text-yellow-200 shadow-[0_0_25px_rgba(250,204,21,0.25)]'
                          : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15'
                      }`}
                    >
                      {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    <Tooltip>Voice input</Tooltip>
                  </TooltipTrigger>

                  <Button
                    onPress={sendMessage}
                    isDisabled={!input.trim() || isThinking}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>

                {/* Live Transcript Preview / Feedback */}
                <AnimatePresence>
                  {(isRecording || transcript) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: 10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: 10 }}
                      className="mt-3 overflow-hidden"
                    >
                      <div className="flex flex-col gap-1 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/70">
                            {isRecording ? "Live Transcription" : "Processing Input"}
                          </span>
                          {isRecording && (
                            <div className="flex items-center gap-1.5" title="Recording in progress">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                              <span className="text-[9px] font-bold text-red-400 uppercase tracking-tighter">Rec</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {transcript || (isRecording ? "Listening..." : "Preparing request...")}
                          {isRecording && (
                            <span className="ml-1 inline-block h-3 w-[1.5px] animate-pulse bg-cyan-300" />
                          )}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] text-white/30">
                <span className="flex items-center gap-2">
                  <span className="text-cyan-300">+</span>
                  Text is committed once, then streamed live in the preview
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
                  {activeModel.label} active
                </span>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, active }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-lg transition ${
        active 
          ? 'border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_25px_rgba(0,212,255,0.15)]'
          : 'border-white/10 bg-white/[0.04]'
      }`}>
      <div className="mb-2 flex items-center gap-2 text-white/40">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.25em]">{label}</span>
      </div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function SmallChip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
      {icon}
      {label}
    </span>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -1, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
          className="h-1.5 w-1.5 rounded-full bg-cyan-300"
        />
      ))}
    </div>
  );
}

export default App;
