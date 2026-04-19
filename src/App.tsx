/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import Landing from './screens/Landing';
import Dashboard from './screens/Dashboard';
import InterviewRoom from './screens/InterviewRoom';
import DebriefScreen from './screens/DebriefScreen';
import SetupWizard from './screens/SetupWizard';
import { InterviewSession } from './types';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<'landing' | 'dashboard' | 'setup' | 'interview' | 'debrief'>('landing');
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) setCurrentScreen('dashboard');
    });
    return unsubscribe;
  }, []);

  const startNewInterview = () => setCurrentScreen('setup');
  
  const handleSessionCreated = (session: InterviewSession) => {
    setActiveSession(session);
    setCurrentScreen('interview');
  };

  const handleInterviewEnd = (session: InterviewSession) => {
    setActiveSession(session);
    setCurrentScreen('debrief');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-teal-500" />
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <div className="min-h-screen">
      {currentScreen === 'dashboard' && (
        <Dashboard 
          user={user} 
          onStart={startNewInterview} 
          onViewSession={(s) => { setActiveSession(s); setCurrentScreen('debrief'); }}
        />
      )}
      {currentScreen === 'setup' && (
        <SetupWizard 
          user={user} 
          onComplete={handleSessionCreated} 
          onBack={() => setCurrentScreen('dashboard')} 
        />
      )}
      {currentScreen === 'interview' && activeSession && (
        <InterviewRoom 
          session={activeSession} 
          onEnd={handleInterviewEnd} 
        />
      )}
      {currentScreen === 'debrief' && activeSession && (
        <DebriefScreen 
          session={activeSession} 
          onBack={() => setCurrentScreen('dashboard')} 
        />
      )}
    </div>
  );
}
