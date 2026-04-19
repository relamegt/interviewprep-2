/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type InterviewType = 'HR' | 'Technical' | 'Coding' | 'Situational' | 'Custom';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface InterviewSession {
  id: string;
  userId: string;
  createdAt: any;
  interviewType: InterviewType;
  difficulty: Difficulty;
  plannedDuration: number;
  companyName: string;
  jobDescription?: string;
  resumeUrl?: string;
  resumeText?: string;
  status: 'pending' | 'active' | 'completed' | 'ended_early';
  transcript: TranscriptTurn[];
  debrief?: DebriefData;
}

export interface TranscriptTurn {
  speaker: 'interviewer' | 'user' | 'system';
  text: string;
  timestamp_start: string;
  timestamp_end: string;
}

export interface DebriefData {
  session_summary: {
    session_status: 'ended_early' | 'completed';
    planned_duration_minutes: number;
    actual_duration_minutes: number;
    role_guess: string;
    company: string;
    interview_type: string;
    difficulty: string;
    topics_discussed: { topic: string; notes: string[] }[];
  };
  scores: {
    overall: number;
    communication: number;
    structure_star: number;
    role_fit: number;
    confidence_clarity: number;
    delivery: number;
    technical_depth: number;
  };
  strengths: {
    title: string;
    evidence: { timestamp_start: string; timestamp_end: string; quote: string };
    why_it_matters: string;
  }[];
  improvements: {
    title: string;
    issue: string;
    evidence: { timestamp_start: string; timestamp_end: string; quote: string };
    better_answer_example: string;
    micro_exercise: string;
  }[];
  delivery_metrics: {
    filler_word_estimate: number;
    pace_wpm_estimate: number;
    long_pause_estimate: number;
  };
  moments_that_mattered: {
    label: string;
    timestamp_start: string;
    timestamp_end: string;
    reason: string;
  }[];
  practice_plan_7_days: {
    day: number;
    focus: string;
    tasks: string[];
    time_minutes: number;
  }[];
  next_interview_checklist: string[];
  notes_if_low_data?: string;
}
