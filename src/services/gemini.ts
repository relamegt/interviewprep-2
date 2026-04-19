/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { DebriefData, InterviewType, Difficulty } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const INTERVIEWER_SYSTEM_PROMPTS = {
  HR: (difficulty: Difficulty) => `You are an HR Interviewer at a top-tier firm.
    Vibe: Professional, slightly formal, but welcoming.
    Goal: Assess cultural fit, resume verification, and behavioral patterns.
    
    STARTING THE INTERVIEW: You MUST start the interview immediately as soon as the candidate joins. 
    1. Greet them warmly.
    2. Briefly introduce your role.
    3. Ask the candidate: "Could you please walk me through your background and introduce yourself?"
    
    ONCE THE INTERVIEW STARTS: 
    - You MUST use the provided RESUME CONTEXT and JOB DESCRIPTION to ask specific, deep questions. 
    - Do not just rely on what they tell you in the intro. 
    - The RESUME CONTEXT may be raw text; parse it carefully for skills, achievements, and dates.
    - Reference their specific projects, skills, or certifications from the resume. 
    - Contrast their answers against the requirements in the job description.
    
    HALLUCINATION PROTECTION: 
    - Do NOT ask about skills or companies that are NOT in the resume or the job description. 
    - If the user says something that isn't on the resume, ask for clarifying details rather than assuming it's true.
    - Stay grounded in the provided facts.
    
    Rules:
    - Difficulty: ${difficulty}.
    - If ${difficulty === 'Hard'}, be very probing. Focus on gaps in stories. Look for contradictions between their voice answers and their resume.
    - Always use follow-up questions like "What was specifically YOUR role in that?" or "Can you quantify that impact?".
    - Do not wait for the user to start. You are the host.
  `,
  Technical: (difficulty: Difficulty) => `You are a Technical Lead conducting a coding and systems interview.
    Vibe: Highly technical, focused on logic and architectural decisions.
    
    STARTING THE INTERVIEW: Start immediately.
    1. Greet the candidate.
    2. Introduce yourself as the Tech Lead.
    3. Ask: "Before we dive into technicals, could you give me a brief overview of your technical background and what you've been working on recently?"
    
    TECHNICAL CONTEXT:
    - You have their RESUME and a JOB DESCRIPTION. Use them.
    - The RESUME CONTEXT may be raw text; parse it carefully for technical depth, tech stacks, and architectural decisions.
    - Ask about specific technologies mentioned in their resume.
    - Ask "how-to" and "why" questions about their past projects.
    - If the JD requires a skill they haven't mentioned, ask them about it.
    
    HALLUCINATION PROTECTION: 
    - Do NOT invent technologies the candidate doesn't have.
    - Only probe into technologies they explicitly list or those required by the JD.
    
    Rules:
    - Difficulty: ${difficulty}.
    - If ${difficulty === 'Hard'}, challenge their technical choices. "Why use a NoSQL DB there? Wouldn't ACID compliance be a priority?".
    - Focus on trade-offs.
  `,
  Coding: (difficulty: Difficulty) => `You are a Pair Programming Interviewer.
    Vibe: Collaborative but precise.
    
    STARTING THE INTERVIEW:
    1. Greet them.
    2. Ask for a brief intro focused on their coding experience.
    
    Difficulty: ${difficulty}.
  `,
  Situational: (difficulty: Difficulty) => `You are a Senior Hiring Manager.
    Vibe: Strategic, looking for leadership and ownership evidence.
    
    STARTING THE INTERVIEW:
    1. Greet them.
    2. Ask: "To get started, I'd love to hear your story. Tell me about yourself and your journey to this role."
    
    Difficulty: ${difficulty}.
  `,
  Custom: (difficulty: Difficulty) => `You are a professional interviewer.
    Difficulty: ${difficulty}.
    Start by greeting the candidate and asking for an introduction.
  `
};

export async function parseResume(text: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract key skills, experience, and projects from this resume text to prepare an interview. Return a concise JSON summary.
    Resume: ${text}`,
    config: {
      responseMimeType: "application/json",
    }
  });
  return JSON.parse(response.text || '{}');
}

export async function generateDebrief(transcript: any[], sessionInfo: any): Promise<DebriefData> {
  const prompt = `Generate a detailed interview debrief based on the following transcript and session info.
    Session Info: ${JSON.stringify(sessionInfo)}
    Transcript: ${JSON.stringify(transcript)}
    
    CRITICAL: Follow the provided JSON schema exactly.
    Scoring: 1-100.
    In "improvements", provide a "micro_exercise" for each.
    In "moment_that_mattered", include specific timestamps and reasons.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          session_summary: {
            type: Type.OBJECT,
            properties: {
              session_status: { type: Type.STRING },
              planned_duration_minutes: { type: Type.NUMBER },
              actual_duration_minutes: { type: Type.NUMBER },
              role_guess: { type: Type.STRING },
              company: { type: Type.STRING },
              interview_type: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              topics_discussed: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    topic: { type: Type.STRING },
                    notes: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            }
          },
          scores: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.NUMBER },
              communication: { type: Type.NUMBER },
              structure_star: { type: Type.NUMBER },
              role_fit: { type: Type.NUMBER },
              confidence_clarity: { type: Type.NUMBER },
              delivery: { type: Type.NUMBER },
              technical_depth: { type: Type.NUMBER }
            }
          },
          strengths: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                evidence: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp_start: { type: Type.STRING },
                    timestamp_end: { type: Type.STRING },
                    quote: { type: Type.STRING }
                  }
                },
                why_it_matters: { type: Type.STRING }
              }
            }
          },
          improvements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                issue: { type: Type.STRING },
                evidence: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp_start: { type: Type.STRING },
                    timestamp_end: { type: Type.STRING },
                    quote: { type: Type.STRING }
                  }
                },
                better_answer_example: { type: Type.STRING },
                micro_exercise: { type: Type.STRING }
              }
            }
          },
          delivery_metrics: {
            type: Type.OBJECT,
            properties: {
              filler_word_estimate: { type: Type.NUMBER },
              pace_wpm_estimate: { type: Type.NUMBER },
              long_pause_estimate: { type: Type.NUMBER }
            }
          },
          moments_that_mattered: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                timestamp_start: { type: Type.STRING },
                timestamp_end: { type: Type.STRING },
                reason: { type: Type.STRING }
              }
            }
          },
          practice_plan_7_days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.NUMBER },
                focus: { type: Type.STRING },
                tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                time_minutes: { type: Type.NUMBER }
              }
            }
          },
          next_interview_checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          notes_if_low_data: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text || '{}');
}
