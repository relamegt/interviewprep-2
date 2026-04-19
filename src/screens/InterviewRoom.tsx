/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
import { User as FirebaseUser } from 'firebase/auth';
import { InterviewSession, TranscriptTurn, InterviewType } from '../types';

// Avatars for different interviewer personas (3D Stylized Renders)
const INTERVIEWER_AVATARS: Record<InterviewType, string> = {
  'HR': 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92209.jpg',
  'Technical': 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92331.jpg',
  'Coding': 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92265.jpg',
  'Situational': 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92208.jpg',
  'Custom': 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92212.jpg'
};
const USER_AVATAR_FALLBACK = 'https://img.freepik.com/premium-photo/3d-render-avatar-character_113255-92205.jpg';

interface InterviewRoomProps {
  session: InterviewSession;
  user: FirebaseUser;
  onEnd: (session: InterviewSession) => void;
}

export default function InterviewRoom({ session, user, onEnd }: InterviewRoomProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [timeLeft, setTimeLeft] = useState(session.plannedDuration * 60);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [ending, setEnding] = useState(false);
  const [currentAgentCaption, setCurrentAgentCaption] = useState<string>('');
  
  const timerRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

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
      
      if (turn.speaker === 'interviewer') {
        setCurrentAgentCaption(turn.text);
      }

      const last = prev[prev.length - 1];
      
      // Heuristic for merging streaming updates from the same speaker
      // If the new turn is from the same speaker and either starts with 
      // the previous text or is a very quick follow-up (less than 2s difference)
      const lastTime = new Date(last.timestamp_end).getTime();
      const newTime = new Date(turn.timestamp_start).getTime();
      const isQuickSuccession = (newTime - lastTime) < 2000;

      if (last.speaker === turn.speaker && (turn.text.startsWith(last.text) || isQuickSuccession)) {
        const updated = [...prev];
        // If it looks like an incremental update (longer text), replace the last one
        if (turn.text.length >= last.text.length) {
          updated[updated.length - 1] = turn;
        } else {
          // If it's shorter but clearly a separate chunk, we might want to append?
          // But for "live" feel, replacing is safer if we trust the API's incremental nature.
          // For now, let's just append if it's potentially a new sentence.
          return [...prev, turn];
        }
        return updated;
      }
      
      return [...prev, turn];
    });
  }, []);

  const { 
    state, 
    error, 
    isSpeaking, 
    volume, 
    isMuted,
    setIsMuted,
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
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Interviewer Avatar */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative group">
              <motion.div 
                animate={{ 
                  scale: isSpeaking ? [1, 1.05, 1] : 1,
                  boxShadow: isSpeaking ? `0 0 ${volume * 100}px rgba(20, 184, 166, 0.4)` : '0 10px 30px rgba(0,0,0,0.5)'
                }}
                transition={{ duration: 0.2, repeat: isSpeaking ? Infinity : 0 }}
                className="w-56 h-56 sm:w-72 sm:h-72 rounded-full glass p-1 overflow-hidden border-2 border-white/10 relative z-10"
              >
                <img 
                  src={INTERVIEWER_AVATARS[session.interviewType]} 
                  alt="AI Interviewer"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-full filter grayscale-[30%] group-hover:grayscale-0 transition-all duration-500"
                />
              </motion.div>
              
              {/* Live Caption Overlay (Agent Speech) */}
              <AnimatePresence>
                {currentAgentCaption && (
                  <motion.div
                    key={currentAgentCaption}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-full max-w-sm text-center z-30 px-4"
                  >
                    <div className="bg-zinc-900/95 backdrop-blur-xl px-6 py-4 rounded-3xl border border-teal-500/30 shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                      <div className="flex items-center gap-2 mb-2 justify-center">
                        <span className={cn("w-1.5 h-1.5 rounded-full bg-teal-500", isSpeaking && "animate-pulse")} />
                        <span className="text-[10px] uppercase font-black tracking-widest text-teal-400/80">
                          {isSpeaking ? "Agent Speaking" : "Last Message"}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-zinc-100 max-h-[100px] overflow-y-auto no-scrollbar">
                        {currentAgentCaption}
                      </p>
                    </div>
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
              <div className="flex items-center justify-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                 <h3 className="text-xl font-bold tracking-tight">{session.interviewType} Panel</h3>
              </div>
              <p className={cn("text-[10px] uppercase font-bold tracking-[0.2em] transform transition-colors", isSpeaking ? "text-teal-400" : "text-zinc-500")}>
                {isSpeaking ? "Analyzing Response..." : "Listening Carefully"}
              </p>
            </div>
          </div>

          {/* User Profile / Candidate */}
          <div className="flex flex-col items-center gap-8">
            <div className="relative group">
               <motion.div 
                animate={{ 
                  scale: state === 'connected' ? [1, 1.02, 1] : 1,
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className="w-40 h-40 sm:w-48 sm:h-48 rounded-full glass p-1 overflow-hidden border-2 border-white/10 relative z-10"
              >
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'Candidate'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <img 
                    src={USER_AVATAR_FALLBACK} 
                    alt="Candidate" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
              </motion.div>
            </div>

            <div className="text-center space-y-1">
               <h3 className="text-lg font-medium text-zinc-300">{user.displayName || user.email?.split('@')[0]}</h3>
               <p className="text-[10px] uppercase font-bold tracking-[0.1em] text-zinc-600">Candidate (You)</p>
            </div>

            <div className="h-16 flex items-center gap-1 mt-4">
              {Array.from({ length: 16 }).map((_, idx) => (
                <motion.div 
                   key={idx}
                   animate={{ height: state === 'connected' ? [8, Math.random() * 40 + 8, 8] : 8 }}
                   transition={{ duration: 0.5, repeat: Infinity, delay: idx * 0.05 }}
                   className="w-1.5 bg-teal-500/20 rounded-full"
                   style={{ height: '12px' }}
                />
              ))}
            </div>
            
            <div className="space-y-4 w-full max-w-xs">
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
             onClick={() => setIsMuted(!isMuted)}
             className={cn(
               "w-14 h-14 rounded-full glass flex items-center justify-center transition-all group relative",
               isMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "hover:bg-white/10"
             )}
             title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
           >
             {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6 group-hover:text-teal-400" />}
             {isMuted && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black" />}
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
            
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 pb-32 scroll-smooth"
            >
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
              {isSidebarOpen && isSpeaking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-[10px] text-teal-500 font-bold uppercase tracking-widest pl-1"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Interviewer is speaking...
                </motion.div>
              )}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl"
          >
            <div className="text-center space-y-8 max-w-sm px-8">
              <div className="relative mx-auto w-32 h-32">
                {/* Orbital Layers */}
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-[1px] border-teal-500/20 rounded-full" 
                />
                <motion.div 
                  animate={{ rotate: -360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-4 border-[1px] border-indigo-500/20 rounded-full" 
                />
                {/* Main Spinner */}
                <div className="absolute inset-0 border-t-2 border-teal-500 rounded-full animate-spin shadow-[0_0_15px_rgba(20,184,166,0.3)]" />
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse shadow-[0_0_10px_rgba(20,184,166,1)]" />
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-3xl font-black tracking-tight text-white uppercase italic italic italic">Pulse Link</h2>
                  <div className="space-y-2">
                    <p className="text-teal-400 text-[10px] uppercase tracking-[0.3em] font-black">Establishing Connection</p>
                    <p className="text-zinc-500 text-xs leading-relaxed max-w-[240px] mx-auto">
                      Synchronizing with the neural panel. This typically takes 3-5 seconds depending on link speed.
                    </p>
                  </div>
                </div>

                <div className="pt-4 flex flex-col gap-4 items-center">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-teal-500"
                      />
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => {
                      disconnect();
                      forceFallback();
                    }}
                    className="text-[10px] text-zinc-600 hover:text-white uppercase tracking-widest font-bold transition-all border-b border-transparent hover:border-zinc-700"
                  >
                    Bypass to Text Mode
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
