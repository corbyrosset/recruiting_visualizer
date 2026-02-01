// Types matching backend models

export interface CandidateSummary {
  id: number;
  folder_name: string;
  full_name: string;
  title: string | null;
  starred: boolean;
  viewed: boolean;
  has_notes: boolean;
}

export interface Candidate {
  id: number;
  folder_name: string;
  full_name: string;
  title: string | null;
  primary_email: string | null;
  linkedin_url: string | null;
  display_urls: string | null; // JSON string array
  experience: string | null; // JSON string array
  education: string | null; // JSON string array
  experience_text: string | null;
  education_text: string | null;
  starred: boolean;
  notes: string | null;
  viewed: boolean;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Experience {
  title: string;
  work: string;
  time: [string, string];
  description?: string;
}

export interface Education {
  school: string;
  degree: string;
  major: string;
  time: [string, string];
  description?: string;
}

export interface SearchResult {
  id: number;
  folder_name: string;
  full_name: string;
  title: string | null;
  education_text: string | null;
  experience_text: string | null;
  starred: boolean;
  viewed: boolean;
}

export interface Stats {
  total: number;
  viewed: number;
  unviewed: number;
  starred: number;
  with_notes: number;
}

export interface ApiResponse<T> {
  status: boolean;
  message: string;
  data: T | null;
}

export interface CandidateUpdate {
  starred?: boolean;
  notes?: string;
  viewed?: boolean;
}

// API Client
export class RecruitingAPI {
  private static baseUrl = '/api';

  static async getCandidates(): Promise<ApiResponse<{ candidates: CandidateSummary[] }>> {
    const res = await fetch(`${this.baseUrl}/candidates`);
    return res.json();
  }

  static async getCandidate(id: number): Promise<ApiResponse<Candidate>> {
    const res = await fetch(`${this.baseUrl}/candidates/${id}`);
    return res.json();
  }

  static async updateCandidate(
    id: number,
    update: CandidateUpdate
  ): Promise<ApiResponse<Candidate>> {
    const res = await fetch(`${this.baseUrl}/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    return res.json();
  }

  static async search(query: string): Promise<ApiResponse<{ candidates: SearchResult[]; query: string }>> {
    const res = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`);
    return res.json();
  }

  static async getStats(): Promise<ApiResponse<Stats>> {
    const res = await fetch(`${this.baseUrl}/stats`);
    return res.json();
  }

  static getResumeUrl(id: number): string {
    // In dev mode, point directly to backend to avoid Vite proxy issues with binary files
    const backendUrl = import.meta.env.DEV ? 'http://localhost:8000' : '';
    return `${backendUrl}${this.baseUrl}/candidates/${id}/resume`;
  }
}

// Helper to parse JSON fields from candidate
export function parseExperience(candidate: Candidate): Experience[] {
  if (!candidate.experience) return [];
  try {
    return JSON.parse(candidate.experience);
  } catch {
    return [];
  }
}

export function parseEducation(candidate: Candidate): Education[] {
  if (!candidate.education) return [];
  try {
    return JSON.parse(candidate.education);
  } catch {
    return [];
  }
}

export function parseDisplayUrls(candidate: Candidate): string[] {
  if (!candidate.display_urls) return [];
  try {
    return JSON.parse(candidate.display_urls);
  } catch {
    return [];
  }
}

// Format date range like "2020-01" to "2024-01" -> "Jan 2020 - Jan 2024"
export function formatDateRange(time: [string, string] | undefined): string {
  if (!time || time.length !== 2) return '';

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month] = dateStr.split('-');
    if (!year) return '';
    if (!month) return year;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = parseInt(month, 10) - 1;
    return `${monthNames[monthIdx] || month} ${year}`;
  };

  const start = formatDate(time[0]);
  const end = formatDate(time[1]);

  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return end;
  return `${start} - ${end}`;
}
