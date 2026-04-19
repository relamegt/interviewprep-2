/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { LogIn, Mail, Lock, UserPlus, Github, Chrome } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!email) return setError('Enter your email first');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setError('Check your email for password reset instructions.');
      setForgotPassword(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="aurora">
        <div className="aurora-blob bg-teal-500/20 top-[-10%] left-[-10%]" />
        <div className="aurora-blob bg-indigo-500/20 bottom-[-10%] right-[-10%]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="luxury-card w-full max-w-md space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-indigo-400">
            InterviewPulse
          </h1>
          <p className="text-zinc-400">Premium AI Interview Preparation</p>
        </div>

        <AnimatePresence mode="wait">
          {!forgotPassword ? (
            <motion.form 
              key="auth-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleSubmit} 
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-teal-500/50 outline-none transition-all"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-zinc-300">Password</label>
                  <button 
                    type="button"
                    onClick={() => setForgotPassword(true)}
                    className="text-xs text-teal-400 hover:text-teal-300"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-teal-500/50 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? 'Processing...' : (isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />)}
                {isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </motion.form>
          ) : (
            <motion.div 
              key="forgot-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-medium">Reset Password</h3>
              <p className="text-sm text-zinc-400">We'll send you a link to reset your password.</p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-teal-500/50 outline-none transition-all"
                  placeholder="name@company.com"
                />
              </div>
              <button onClick={handleResetPassword} className="btn-primary w-full">Send Reset Link</button>
              <button onClick={() => setForgotPassword(false)} className="text-sm text-zinc-400 w-full hover:text-white">Back to Login</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-900 px-2 text-zinc-500">Or continue with</span></div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={handleGoogleSignIn}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Chrome className="w-4 h-4 text-red-400" />
            Google
          </button>
        </div>

        <p className="text-center text-sm text-zinc-500">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 text-teal-400 hover:text-teal-300 font-medium"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
