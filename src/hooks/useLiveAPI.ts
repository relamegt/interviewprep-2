/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { TranscriptTurn } from '../types';

export type LiveState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'fallback';

interface UseLiveAPIOptions {
  systemInstruction: string;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onSessionEnd?: () => void;
}

export function useLiveAPI({ systemInstruction, onTranscriptUpdate, onSessionEnd }: UseLiveAPIOptions) {
  const [state, setState] = useState<LiveState>('idle');
  const stateRef = useRef<LiveState>('idle');
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  
  const aiRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECTS = 2;

  // Cleanup function
  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setState('idle');
  }, []);

  const connect = useCallback(async () => {
    if (state === 'connected' || state === 'connecting') return;

    setState('connecting');
    setError(null);

    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;

      // Initialize AudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Set up Session
      const sessionPromise = aiRef.current.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setState('connected');
            reconnectCountRef.current = 0;
            
            // Start capturing audio
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Calculate volume for UI
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              setVolume(Math.sqrt(sum / inputData.length));
              
              // Convert to Int16 PCM
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              sessionRef.current?.sendRealtimeInput({
                audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Model Transcriptions
            if (message.serverContent?.modelTurn?.parts) {
              const text = message.serverContent.modelTurn.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join("");
              
              if (text) {
                onTranscriptUpdate({
                  speaker: 'interviewer',
                  text,
                  timestamp_start: new Date().toISOString(),
                  timestamp_end: new Date().toISOString()
                });
              }
            }

            // Handle User Transcriptions (inputAudioTranscription)
            const userTurn = (message.serverContent as any)?.userTurn;
            if (userTurn?.parts) {
              const text = (userTurn.parts as any[])
                .filter(p => p.text)
                .map(p => p.text)
                .join("");
              
              if (text) {
                onTranscriptUpdate({
                  speaker: 'user',
                  text,
                  timestamp_start: new Date().toISOString(),
                  timestamp_end: new Date().toISOString()
                });
              }
            }
            
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (base64Audio) {
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const pcmData = new Int16Array(bytes.buffer);
              
              // Play PCM data
              if (audioContextRef.current) {
                const buffer = audioContextRef.current.createBuffer(1, pcmData.length, 16000);
                const floatData = buffer.getChannelData(0);
                for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 32768;
                
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                
                // Slightly increase pitch and speed for better clarity as requested
                source.playbackRate.value = 1.08; 
                
                const startTime = Math.max(audioContextRef.current.currentTime, nextPlayTimeRef.current);
                source.start(startTime);
                nextPlayTimeRef.current = startTime + (buffer.duration / source.playbackRate.value);
                
                setIsSpeaking(true);
                // Reset isSpeaking after the audio finishes playing
                setTimeout(() => {
                  if (audioContextRef.current && audioContextRef.current.currentTime >= nextPlayTimeRef.current - 0.1) {
                    setIsSpeaking(false);
                  }
                }, (startTime - audioContextRef.current.currentTime + buffer.duration) * 1000);
              }
            }

            if (message.serverContent?.interrupted) {
              // Handle interruption
              nextPlayTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            handleError("Connection error. Attempting to reconnect...");
          },
          onclose: () => {
            if (stateRef.current === 'connected') {
              handleError("Connection closed unexpectedly.");
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Connection failed:", err);
      handleError(err.message || "Failed to connect to microhpone");
    }
  }, [state, systemInstruction, onTranscriptUpdate]);

  const handleError = useCallback((msg: string) => {
    if (reconnectCountRef.current < MAX_RECONNECTS) {
      reconnectCountRef.current += 1;
      setState('reconnecting');
      setError(`${msg} (Attempt ${reconnectCountRef.current}/${MAX_RECONNECTS})`);
      setTimeout(() => connect(), 2000);
    } else {
      setState('fallback');
      setError("Voice connection failed. Switching to text mode.");
    }
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text });
      onTranscriptUpdate({
        speaker: 'user',
        text,
        timestamp_start: new Date().toISOString(),
        timestamp_end: new Date().toISOString()
      });
    }
  }, [onTranscriptUpdate]);

  return {
    state,
    error,
    isSpeaking,
    volume,
    connect,
    disconnect,
    sendMessage,
    forceFallback: () => setState('fallback')
  };
}
