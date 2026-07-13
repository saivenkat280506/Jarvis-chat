/**
 * AgentOverlay.jsx — Live Agent Progress Overlay
 * ================================================
 * Displays a floating, animated overlay when the autonomous agent is running.
 * Shows current step, action being executed, result, and a STOP button.
 *
 * Props:
 *   steps       : array of { step, total, action, result, status, task }
 *   onStop      : callback to call when user clicks Stop
 *   visible     : boolean — whether overlay is shown
 */

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_COLOR = {
  running: 'text-cyan-300',
  done: 'text-green-300',
  stopped: 'text-yellow-300',
  error: 'text-red-400',
};

const STATUS_GLOW = {
  running: 'shadow-[0_0_30px_rgba(0,212,255,0.2)]',
  done: 'shadow-[0_0_30px_rgba(34,197,94,0.2)]',
  stopped: 'shadow-[0_0_30px_rgba(250,204,21,0.2)]',
  error: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]',
};

function AgentStepRow({ stepData, isLatest }) {
  const { step, total, action, result, status } = stepData;
  const isDone = action === 'DONE' || action === 'STOPPED';
  const color = STATUS_COLOR[status] || 'text-white/60';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex flex-col gap-1 rounded-xl border px-4 py-3 text-xs transition-all ${
        isLatest
          ? 'border-cyan-500/30 bg-cyan-500/10'
          : 'border-white/5 bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold uppercase tracking-widest text-white/40">
          {isDone ? '✓' : `Step ${step}${total ? `/${total}` : ''}`}
        </span>
        <span className={`font-bold uppercase tracking-wider ${color}`}>
          {status}
        </span>
      </div>

      {/* Command */}
      <code className="mt-1 break-all font-mono text-[11px] text-cyan-200/90">
        {action}
      </code>

      {/* Result */}
      {result && result !== 'executing...' && (
        <p className="mt-0.5 text-[11px] text-white/50 leading-relaxed">
          {result}
        </p>
      )}

      {/* Pulse while executing */}
      {isLatest && status === 'running' && result === 'executing...' && (
        <div className="mt-1 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
              className="h-1 w-1 rounded-full bg-cyan-400"
            />
          ))}
          <span className="text-[10px] text-cyan-400/70">Executing…</span>
        </div>
      )}
    </motion.div>
  );
}

export default function AgentOverlay({ steps, onStop, visible }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const latest = steps[steps.length - 1];
  const latestStatus = latest?.status ?? 'running';
  const isComplete = latestStatus === 'done' || latestStatus === 'stopped';
  const task = steps[0]?.task ?? '';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="agent-overlay"
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.25 }}
          className={`pointer-events-auto fixed bottom-28 right-6 z-50 flex w-[380px] max-h-[55vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/80 backdrop-blur-2xl ${STATUS_GLOW[latestStatus] ?? ''}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2">
              {/* Animated ring when running */}
              {!isComplete && (
                <motion.span
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="h-2 w-2 rounded-full bg-cyan-400"
                />
              )}
              {isComplete && latestStatus === 'done' && (
                <span className="h-2 w-2 rounded-full bg-green-400" />
              )}
              {isComplete && latestStatus === 'stopped' && (
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">
                Agent {isComplete ? (latestStatus === 'done' ? 'Done' : 'Stopped') : 'Running'}
              </span>
            </div>

            {!isComplete && (
              <button
                onClick={onStop}
                className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
              >
                ■ Stop
              </button>
            )}
          </div>

          {/* Task description */}
          {task && (
            <div className="border-b border-white/5 px-5 py-2">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Task</p>
              <p className="mt-0.5 text-xs text-white/60 leading-snug">{task}</p>
            </div>
          )}

          {/* Steps list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 custom-scrollbar">
            {steps.map((s, idx) => (
              <AgentStepRow
                key={`${s.step}-${idx}`}
                stepData={s}
                isLatest={idx === steps.length - 1}
              />
            ))}
            <div ref={scrollRef} />
          </div>

          {/* Footer progress bar */}
          {!isComplete && latest && (
            <div className="px-5 pb-4 pt-2">
              <div className="mb-1 flex justify-between text-[10px] text-white/30">
                <span>Progress</span>
                <span>{latest.step}/{latest.total ?? '?'} steps</span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-cyan-400"
                  animate={{ width: `${Math.min(100, ((latest.step ?? 1) / (latest.total ?? 15)) * 100)}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
