/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Mic, Shield, Zap, Target } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
}

export default function Landing({ onGetStarted }: LandingProps) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-6 text-center space-y-12">
      <div className="aurora">
        <div className="aurora-blob bg-teal-500/10 top-0 left-0" />
        <div className="aurora-blob bg-indigo-500/10 bottom-0 right-0" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 max-w-3xl"
      >
        <div className="inline-block px-4 py-1.5 rounded-full border border-teal-500/20 bg-teal-500/5 text-teal-400 text-xs font-bold uppercase tracking-widest mb-4">
          Next-Gen AI Interview Prep
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          Master the High-Pressure <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-indigo-400">Interview.</span>
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
          Premium voice-first simulations powered by Gemini Live. 
          Upload your resume, set the difficulty, and receive deep-dive AI debriefs.
        </p>
        <div className="pt-8">
          <button onClick={onGetStarted} className="btn-primary text-lg px-12 py-4">
            Get Started Free
          </button>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl"
      >
        <Feature icon={<Mic className="w-5 h-5" />} title="Voice Native" desc="Low-latency real-time streaming" />
        <Feature icon={<Shield className="w-5 h-5" />} title="Stress Test" desc="Hard mode for ruthless feedback" />
        <Feature icon={<Zap className="w-5 h-5" />} title="Deep Analysis" desc="Structured STAR debriefs" />
        <Feature icon={<Target className="w-5 h-5" />} title="Custom Built" desc="Tailored to your target company" />
      </motion.div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="space-y-3">
      <div className="mx-auto w-10 h-10 rounded-xl glass flex items-center justify-center text-teal-500">
        {icon}
      </div>
      <h3 className="font-bold text-sm tracking-wide">{title}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}
