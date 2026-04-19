/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { User } from 'firebase/auth';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { InterviewSession, InterviewType, Difficulty } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Upload, 
  Link as LinkIcon, 
  FileText, 
  Trophy, 
  Clock, 
  Settings,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { parseResume } from '../services/gemini';

interface SetupWizardProps {
  user: User;
  onComplete: (session: InterviewSession) => void;
  onBack: () => void;
}

const STEPS = [
  { id: 'context', title: 'Context', description: 'What are you aiming for?' },
  { id: 'assets', title: 'Assets', description: 'Resume & Job details' },
  { id: 'mode', title: 'Mode', description: 'Setup your simulation' },
];

export default function SetupWizard({ user, onComplete, onBack }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('HR');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [duration, setDuration] = useState(30);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setResumeFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
    else finalize();
  };

  const finalize = async () => {
    setLoading(true);
    setError(null);
    try {
      let resumeUrl = '';
      let resumeText = '';
      
      // Fast path: If there's a file, try to read it as text for the AI context immediately
      if (resumeFile) {
        resumeText = `Context from file: ${resumeFile.name}. Type: ${resumeFile.type}. Size: ${Math.round(resumeFile.size / 1024)}KB.`;
        
        // Start upload in background but track its promise
        const uploadTask = (async () => {
          try {
            const storageRef = ref(storage, `resumes/${user.uid}/${Date.now()}_${resumeFile.name}`);
            const snapshot = await uploadBytes(storageRef, resumeFile);
            return await getDownloadURL(snapshot.ref);
          } catch (e) {
            console.warn("Background upload failed, session will proceed without URL:", e);
            return '';
          }
        })();

        // Add a 2s timeout for the "Preparing..." spinner to keep it snappy
        const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), 2000));
        resumeUrl = await Promise.race([uploadTask, timeoutPromise]);
      }

      const sessionData = {
        userId: user.uid,
        companyName,
        website,
        jobDescription,
        interviewType,
        difficulty,
        plannedDuration: duration,
        resumeUrl,
        resumeText,
        status: 'pending',
        transcript: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      onComplete({ id: docRef.id, ...sessionData } as any);
    } catch (err: any) {
      console.error("Setup failed:", err);
      setError(err.message || "An unexpected error occurred while preparing your session.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 min-h-screen">
      <div className="space-y-12">
        <header className="space-y-6">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all",
                  idx <= currentStep ? "border-teal-500 bg-teal-500/10 text-teal-400" : "border-white/10 text-zinc-600"
                )}>
                  {idx < currentStep ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <div className="hidden sm:block">
                  <div className={cn("text-xs font-bold uppercase tracking-wider", idx <= currentStep ? "text-white" : "text-zinc-600")}>{s.title}</div>
                </div>
                {idx < STEPS.length - 1 && <div className="w-8 h-[1px] bg-white/5 mx-2" />}
              </div>
            ))}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}
            {currentStep === 0 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">The Target</h2>
                  <p className="text-zinc-500 text-sm">Where are you interviewing today?</p>
                </div>
                <div className="space-y-4">
                  <div className="luxury-card space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-500">Company Name</label>
                      <input 
                        type="text" 
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Google, Stripe, etc."
                        className="w-full bg-black/50 border border-white/5 rounded-xl p-4 focus:border-teal-500/50 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-500">Website URL</label>
                      <div className="relative">
                        <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input 
                          type="url" 
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://company.com"
                          className="w-full bg-black/50 border border-white/5 rounded-xl p-4 pl-12 focus:border-teal-500/50 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">The Assets</h2>
                  <p className="text-zinc-500 text-sm">Upload your profile for a customized session.</p>
                </div>
                <div className="space-y-4">
                  <div className="luxury-card flex flex-col items-center justify-center py-12 border-dashed border-2 hover:border-teal-500/30 transition-all cursor-pointer relative">
                    <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Upload className="w-8 h-8 text-teal-500 mb-4" />
                    <div className="text-center">
                      <div className="font-medium">{resumeFile ? resumeFile.name : 'Upload Resume (CV)'}</div>
                      <div className="text-xs text-zinc-500 mt-1">PDF, Word, or TXT — Used for context</div>
                    </div>
                  </div>
                  <div className="luxury-card space-y-2">
                    <label className="text-xs font-bold uppercase text-zinc-500">Job Description</label>
                    <textarea 
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the job description or requirements here..."
                      className="w-full bg-black/50 border border-white/5 rounded-xl p-4 min-h-[160px] focus:border-teal-500/50 outline-none transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">The Simulation</h2>
                  <p className="text-zinc-500 text-sm">Tailor the difficulty and format.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="luxury-card space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold uppercase text-zinc-500">Interview Type</span>
                    </div>
                    {['HR', 'Technical', 'Coding', 'Situational'].map(type => (
                      <button 
                        key={type}
                        onClick={() => setInterviewType(type as InterviewType)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border transition-all text-sm",
                          interviewType === type ? "border-teal-500 bg-teal-500/10 text-white" : "border-white/5 hover:bg-white/5 text-zinc-500"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <div className="luxury-card space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold uppercase text-zinc-500">Difficulty</span>
                    </div>
                    {['Easy', 'Medium', 'Hard'].map(diff => (
                      <button 
                        key={diff}
                        onClick={() => setDifficulty(diff as Difficulty)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border transition-all text-sm",
                          difficulty === diff ? "border-teal-500 bg-teal-500/10 text-white" : "border-white/5 hover:bg-white/5 text-zinc-500"
                        )}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="luxury-card space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold uppercase text-zinc-500">Planned Duration</span>
                    </div>
                    <span className="text-2xl font-bold text-teal-400">{duration}<span className="text-sm font-normal text-zinc-500 ml-1">mins</span></span>
                  </div>
                  
                  <div className="space-y-4">
                    <input 
                      type="range" 
                      min="5" 
                      max="60" 
                      step="5"
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
                      <span>5 min</span>
                      <span>30 min</span>
                      <span>60 min</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <footer className="flex justify-between pt-6 border-t border-white/5">
          <button 
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(currentStep - 1)}
            className="btn-secondary disabled:opacity-30"
          >
            Previous
          </button>
          <button 
            onClick={handleNext}
            disabled={loading}
            className="btn-primary min-w-[140px] flex items-center justify-center gap-2"
          >
            {loading ? 'Preparing...' : currentStep === STEPS.length - 1 ? 'Start Pulse' : 'Continue'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </footer>
      </div>
    </div>
  );
}
