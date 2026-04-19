/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { InterviewSession } from '../types';
import { motion } from 'motion/react';
import { 
  Trophy, 
  Target, 
  ArrowLeft, 
  Calendar, 
  CheckCircle2, 
  Zap, 
  AlertTriangle,
  ChevronRight,
  RefreshCcw,
  Clock,
  Quote
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  ResponsiveContainer 
} from 'recharts';
import { generateDebrief } from '../services/gemini';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface DebriefScreenProps {
  session: InterviewSession;
  onBack: () => void;
}

export default function DebriefScreen({ session, onBack }: DebriefScreenProps) {
  const [data, setData] = useState(session.debrief);
  const [regenerating, setRegenerating] = useState(false);

  const chartData = data ? [
    { subject: 'Overall', A: data.scores.overall },
    { subject: 'Communication', A: data.scores.communication },
    { subject: 'STAR Structure', A: data.scores.structure_star },
    { subject: 'Role Fit', A: data.scores.role_fit },
    { subject: 'Confidence', A: data.scores.confidence_clarity },
    { subject: 'Technical', A: data.scores.technical_depth },
  ] : [];

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const actualDuration = data?.session_summary.actual_duration_minutes || 0;
      const newDebrief = await generateDebrief(session.transcript, {
        ...session,
        actual_duration_minutes: actualDuration,
        session_status: session.status
      });
      await updateDoc(doc(db, 'sessions', session.id), {
        debrief: newDebrief,
        updatedAt: serverTimestamp()
      });
      setData(newDebrief);
    } catch (err) {
      console.error("Regeneration failed:", err);
    } finally {
      setRegenerating(false);
    }
  };

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-teal-500 mx-auto" />
        <p className="text-zinc-400">Loading your debrief intelligence...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold">Session Debrief</h1>
            <p className="text-zinc-500">
               {data.session_summary.company} • {data.session_summary.interview_type} • {data.session_summary.difficulty}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRegenerate} 
            disabled={regenerating}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            {regenerating ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
            Regenerate AI Analysis
          </button>
        </div>
      </header>

      {/* Main Stats */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="lg:col-span-2 luxury-card flex flex-col items-center py-10"
        >
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                <Radar
                  name="Score"
                  dataKey="A"
                  stroke="#14b8a6"
                  fill="#14b8a6"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center mt-4">
             <div className="text-5xl font-bold text-teal-400">{data.scores.overall}%</div>
             <div className="text-xs uppercase tracking-widest text-zinc-600 mt-1">Interviewer Consensus</div>
          </div>
        </motion.div>

        <div className="flex flex-col gap-6">
          <div className="luxury-card flex flex-col justify-between h-full bg-teal-500/5">
            <div className="space-y-2">
              <h3 className="font-bold flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-400" />
                Role Guess
              </h3>
              <p className="text-2xl font-semibold">{data.session_summary.role_guess}</p>
            </div>
            <div className="mt-8 space-y-4">
               <div>
                 <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest">Active Duration</div>
                 <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-500" />
                    <span>{data.session_summary.actual_duration_minutes}m of {data.session_summary.planned_duration_minutes}m</span>
                 </div>
               </div>
               <div>
                  <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest">Status</div>
                  <div className={cn(
                    "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1",
                    data.session_summary.session_status === 'completed' ? "bg-teal-500/20 text-teal-400" : "bg-orange-500/20 text-orange-400"
                  )}>
                    {data.session_summary.session_status.replace('_', ' ')}
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Strengths & Improvements */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-400" />
            Core Strengths
          </h3>
          <div className="space-y-4">
            {data.strengths.map((s, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="luxury-card border-l-4 border-l-teal-500"
              >
                <div className="font-bold mb-2">{s.title}</div>
                <div className="p-3 bg-white/5 rounded-xl text-sm italic text-zinc-400 mb-3 flex gap-3">
                  <Quote className="w-4 h-4 shrink-0 mt-1 opacity-20" />
                  "{s.evidence.quote}"
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{s.why_it_matters}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Growth Opportunities
          </h3>
          <div className="space-y-4">
            {data.improvements.map((s, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="luxury-card border-l-4 border-l-orange-500"
              >
                <div className="font-bold mb-1">{s.title}</div>
                <div className="text-xs text-orange-400 font-medium mb-3 uppercase tracking-wide">{s.issue}</div>
                
                <div className="space-y-4 p-4 bg-black/30 rounded-xl">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-600 font-bold uppercase">Better Approach</div>
                    <p className="text-xs text-teal-400">{s.better_answer_example}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-600 font-bold uppercase">Daily Drill</div>
                    <p className="text-xs text-zinc-400 italic font-medium">{s.micro_exercise}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Practice Plan */}
      <section className="space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-400" />
          7-Day Acceleration Plan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.practice_plan_7_days.map((day, idx) => (
            <div key={idx} className="luxury-card space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase p-1 px-2 bg-zinc-800 rounded">Day {day.day}</span>
                <span className="text-xs text-zinc-500">{day.time_minutes}m</span>
              </div>
              <div className="font-bold text-sm text-teal-300">{day.focus}</div>
              <ul className="space-y-2">
                {day.tasks.map((t, i) => (
                  <li key={i} className="text-[11px] text-zinc-500 flex gap-2">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-teal-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Checklist */}
      <section className="luxury-card bg-indigo-500/5">
        <div className="flex items-center gap-6">
           <div className="hidden md:flex w-24 h-24 rounded-full bg-indigo-500/20 items-center justify-center">
             <CheckCircle2 className="w-12 h-12 text-indigo-400" />
           </div>
           <div className="flex-1 space-y-4">
              <h3 className="text-xl font-bold">Ready for the real thing?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.next_interview_checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-zinc-400">
                    <div className="w-4 h-4 rounded border border-indigo-500/50 flex items-center justify-center">
                      <div className="w-2 h-2 bg-indigo-500 rounded-sm" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
           </div>
        </div>
      </section>
    </div>
  );
}
