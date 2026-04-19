/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { InterviewSession } from '../types';
import { User as FirebaseUser, LogOut, Play, History, TrendingUp, Mic2, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { signOut, User } from 'firebase/auth';

interface DashboardProps {
  user: User;
  onStart: () => void;
  onViewSession: (s: InterviewSession) => void;
}

export default function Dashboard({ user, onStart, onViewSession }: DashboardProps) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      try {
        const q = query(
          collection(db, 'sessions'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InterviewSession));
        setSessions(data);
      } catch (err) {
        console.error("Error loading sessions:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, [user.uid]);

  const avgScore = sessions.length > 0 
    ? Math.round(sessions.reduce((acc, s) => acc + (s.debrief?.scores.overall || 0), 0) / sessions.length)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 shadow-xl">
             <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} alt="Avatar" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Welcome, {user.displayName || user.email?.split('@')[0]}</h2>
            <p className="text-zinc-500 text-sm">Review your progress and sharpen your skills.</p>
          </div>
        </div>
        <button onClick={() => signOut(auth)} className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="luxury-card flex flex-col justify-between">
          <div className="p-2 w-fit rounded-lg bg-teal-500/10 text-teal-500"><TrendingUp className="w-5 h-5" /></div>
          <div>
            <div className="text-4xl font-bold mt-4">{avgScore}%</div>
            <div className="text-zinc-500 text-sm">Average Score</div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="luxury-card flex flex-col justify-between border-teal-500/20 shadow-teal-500/5">
          <div className="p-2 w-fit rounded-lg bg-indigo-500/10 text-indigo-500"><Mic2 className="w-5 h-5" /></div>
          <div>
            <div className="text-4xl font-bold mt-4">{sessions.length}</div>
            <div className="text-zinc-500 text-sm">Sessions Completed</div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="luxury-card flex items-center justify-center cursor-pointer hover:bg-teal-600/10 group" onClick={onStart}>
          <div className="text-center">
            <div className="mx-auto p-4 w-fit rounded-full bg-teal-600 group-hover:bg-teal-500 transition-colors shadow-lg"><Play className="w-6 h-6 fill-current" /></div>
            <div className="mt-4 font-semibold">Start New Mock</div>
          </div>
        </motion.div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-2 text-zinc-400">
          <History className="w-5 h-5" />
          <h3 className="font-medium">Recent Sessions</h3>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-teal-500" /></div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl text-zinc-600">No sessions yet. Time to start your first interview!</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s, idx) => (
              <motion.div 
                key={s.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => onViewSession(s)}
                className="luxury-card flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 active:scale-[0.99] group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-teal-400 transition-colors">
                    <Star className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">{s.companyName} — {s.interviewType}</h4>
                    <p className="text-xs text-zinc-500">
                      {s.createdAt?.toDate ? format(s.createdAt.toDate(), 'PPP p') : 'Just now'} • {s.difficulty}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {s.debrief && (
                    <div className="text-right">
                      <div className="font-bold text-teal-400">{s.debrief.scores.overall}%</div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-600">Score</div>
                    </div>
                  )}
                  <div className="btn-secondary py-2 px-4 text-xs">View Debrief</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
