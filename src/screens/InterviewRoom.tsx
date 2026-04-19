/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { InterviewSession, TranscriptTurn } from '../types';
import { useLiveAPI } from '../hooks/useLiveAPI';
import { INTERVIEWER_SYSTEM_PROMPTS, generateDebrief } from '../services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  PhoneOff, 
  AlertCircle, 
  MessageSquare, 
  Clock, 
  ChevronRight,
  Send,
  Loader2,
  RefreshCw,
  User,
  MoreVertical
} from 'lucide-react';
import { cn, formatTime } from '../lib/utils';

interface InterviewRoomProps {
  session: InterviewSession;
  onEnd: (session: InterviewSession) => void;
}

export default function InterviewRoom({ session, onEnd }: InterviewRoomProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [timeLeft, setTimeLeft] = useState(session.plannedDuration * 60);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [ending, setEnding] = useState(false);
  
  const timerRef = useRef<any>(null);

  const sysInstruction = `
    ${INTERVIEWER_SYSTEM_PROMPTS[session.interviewType](session.difficulty)}
    
    CRITICAL DATABASE CONTEXT (Use this to form your questions):
    - Target Company: ${session.companyName || 'Not specified'}
    - Job Description: ${session.jobDescription || 'Not specified'}
    - Candidate Resume Data: ${session.resumeText || 'None provided'}
    
    INSTRUCTIONS:
    - You MUST use the "Candidate Resume Data" as your primary source for experience verification.
    - If the user's answers contradict the "Candidate Resume Data", call it out professionally.
    - Reference specific skills and roles from the Resume Data during the interview.
    - Keep responses natural, conversational, and relatively short.
    - Goal: Conduct a highly realistic interview panel experience.
  `;

  const onTranscriptUpdate = useCallback((turn: TranscriptTurn) => {
    setTranscript(prev => {
      if (prev.length === 0) return [turn];
      
      const last = prev[prev.length - 1];
      
      // If it's the same speaker and the new turn's text starts with the old turn's text,
      // it's likely an incremental update (common in Live API transcripts).
      if (last.speaker === turn.speaker && turn.text.startsWith(last.text)) {
        const updated = [...prev];
        updated[updated.length - 1] = turn;
        return updated;
      }
      
      // If the texts are different but it's the same speaker and very close in time, 
      // we might want to append? But for now, let's keep them separate if they don't start with each other.
      // This helps with distinct sentences.
      return [...prev, turn];
    });
  }, []);

  const { 
    state, 
    error, 
    isSpeaking, 
    volume, 
    connect, 
    disconnect, 
    sendMessage,
    forceFallback
  } = useLiveAPI({
    systemInstruction: sysInstruction,
    onTranscriptUpdate,
    onSessionEnd: () => handleEnd()
  });

  const hasStartedRef = useRef(false);

  useEffect(() => {
    connect();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => {
      disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state === 'connected' && !hasStartedRef.current) {
      hasStartedRef.current = true;
      // Trigger the AI to start the interview immediately
      sendMessage("The candidate has joined. Please start the interview by introducing yourself and asking for their introduction.");
    }
  }, [state, sendMessage]);

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    disconnect();
    
    try {
      const actualDuration = Math.round((session.plannedDuration * 60 - timeLeft) / 60);
      const debrief = await generateDebrief(transcript, {
        ...session,
        actual_duration_minutes: actualDuration,
        session_status: timeLeft > 0 ? 'ended_early' : 'completed'
      });

      const updatedSession: InterviewSession = {
        ...session,
        transcript,
        debrief,
        status: (timeLeft > 0 ? 'ended_early' : 'completed') as any
      };

      await updateDoc(doc(db, 'sessions', session.id), {
        transcript,
        debrief,
        status: updatedSession.status,
        updatedAt: serverTimestamp()
      });

      onEnd(updatedSession);
    } catch (err) {
      console.error("Failed to generate debrief:", err);
      // Fallback: end without debrief if it fails
      onEnd({ ...session, transcript, status: 'ended_early' });
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendMessage(textInput);
    setTextInput('');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      <div className="aurora opacity-30">
        <div className="aurora-blob bg-teal-500/20 top-[20%] left-[20%]" />
        <div className="aurora-blob bg-indigo-500/20 bottom-[20%] right-[20%]" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 glass z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center font-bold text-lg">IP</div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide uppercase text-zinc-400">Interview In Progress</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-zinc-100">{formatTime(timeLeft)} remaining</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] uppercase font-bold tracking-tighter text-zinc-400 border border-white/5">
            {session.difficulty} • {session.interviewType}
          </span>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="p-2 rounded-full hover:bg-white/5 transition-colors relative"
          >
            <MessageSquare className="w-5 h-5" />
            {transcript.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-teal-500 rounded-full" />}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 relative flex items-center justify-center p-6 sm:p-12 overflow-hidden">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Interviewer Avatar */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <motion.div 
                animate={{ 
                  scale: isSpeaking ? [1, 1.05, 1] : 1,
                  boxShadow: isSpeaking ? `0 0 ${volume * 100}px rgba(20, 184, 166, 0.3)` : 'none'
                }}
                transition={{ duration: 0.2, repeat: isSpeaking ? Infinity : 0 }}
                className="w-48 h-48 sm:w-64 sm:h-64 rounded-full glass flex items-center justify-center border-2 border-white/5 relative z-10"
              >
                <User className="w-24 h-24 text-teal-400" />
              </motion.div>
              
              {/* Live Caption Overlay */}
              <AnimatePresence>
                {isSpeaking && transcript.length > 0 && transcript[transcript.length-1].speaker === 'interviewer' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-full max-w-xs text-center z-20"
                  >
                    <p className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 text-xs text-zinc-100 line-clamp-2">
                      {transcript[transcript.length-1].text}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isSpeaking && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1.2 }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    className="absolute inset-0 border-4 border-teal-500/20 rounded-full"
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-medium">Interviewer Panel</h3>
              <p className={cn("text-xs uppercase tracking-widest text-zinc-500", isSpeaking ? "text-teal-400" : "")}>
                {isSpeaking ? "Speaking..." : "Listening..."}
              </p>
            </div>
          </div>

          {/* User Status / Visualizer */}
          <div className="flex flex-col items-center gap-8">
            <div className="h-24 flex items-center gap-1">
              {Array.from({ length: 24 }).map((_, idx) => (
                <motion.div 
                   key={idx}
                   animate={{ height: state === 'connected' ? [10, Math.random() * 80 + 10, 10] : 10 }}
                   transition={{ duration: 0.5, repeat: Infinity, delay: idx * 0.05 }}
                   className="w-1.5 bg-zinc-800 rounded-full"
                   style={{ height: '20px' }}
                />
              ))}
            </div>
            
            <div className="space-y-4 w-full">
              {state === 'error' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="text-xs">{error}</span>
                </div>
              )}
              {state === 'reconnecting' && (
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span className="text-xs">Connection lost. Reconnecting...</span>
                </div>
              )}
              {state === 'fallback' && (
                <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 shrink-0" />
                  <span className="text-xs">Switched to Text Fallback. Use the sidebar to chat.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floating Controls */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6">
           <button 
             onClick={disconnect}
             className="w-14 h-14 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-all group"
           >
             <Mic className="w-6 h-6 group-hover:text-teal-400" />
           </button>
           <button 
             onClick={handleEnd}
             disabled={ending}
             className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold transition-all active:scale-95 shadow-2xl flex items-center gap-3"
           >
             {ending ? <Loader2 className="w-5 h-5 animate-spin" /> : <PhoneOff className="w-5 h-5" />}
             End Interview
           </button>
           <button 
             onClick={() => connect()}
             className="w-14 h-14 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-all"
           >
             <RefreshCw className={cn("w-6 h-6", state === 'connecting' && "animate-spin")} />
           </button>
        </div>
      </main>

      {/* Transcript Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-96 glass z-20 flex flex-col"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-500" />
                Live Transcript
              </h3>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
              {transcript.length === 0 && (
                <div className="text-center py-20 text-zinc-600 text-sm">Transcript will appear here as you speak.</div>
              )}
              {transcript.filter(t => !t.text.includes("The candidate has joined")).map((turn, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "space-y-1",
                    turn.speaker === 'user' ? "text-right" : "text-left"
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{turn.speaker}</div>
                  <div className={cn(
                    "inline-block rounded-2xl px-4 py-3 text-sm max-w-[90%]",
                    turn.speaker === 'user' ? "bg-teal-600/20 text-teal-100 border border-teal-500/20 rounded-tr-none" : "bg-zinc-800 text-zinc-100 rounded-tl-none border border-white/5"
                  )}>
                    {turn.text}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="p-6 border-t border-white/5 bg-zinc-950/80">
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <input 
                  type="text" 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-teal-500/50 outline-none"
                />
                <button type="submit" className="p-2 bg-teal-600 rounded-xl hover:bg-teal-500 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Intro Modal */}
      <AnimatePresence>
        {state === 'connecting' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="text-center space-y-6 max-w-sm px-6">
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 border-4 border-teal-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-t-teal-500 rounded-full animate-spin" />
              </div>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Initializing Pulse</h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Connecting to the Gemini Live server carefully to ensure high-fidelity voice transmission.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    disconnect();
                    forceFallback();
                  }}
                  className="text-xs text-zinc-500 hover:text-teal-400 underline transition-colors"
                >
                  Taking too long? Start in Text Mode
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
