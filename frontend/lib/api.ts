// File: lib/api.ts
// Purpose: Typed API client wrapping fetch for all EAQ endpoints.
//
// AUTH TOKEN STORAGE DECISION:
// We use localStorage via React Context (AuthContext.tsx) instead of httpOnly cookies.
// Rationale: The frontend (deployed on Vercel) and backend (deployed on Railway) are
// on different origins. httpOnly cookies would require complex CORS + SameSite=None +
// Secure configuration and a reverse proxy for local dev. localStorage with Bearer
// tokens is the standard pattern for SPA + separate API architectures.

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface LoginResponse {
  token: string;
  role: 'coordinator' | 'evaluator';
  userId: string;
  evaluatorId: string | null;
}

export interface AssignResponse {
  message: string;
  assigned: number;
  skipped: number;
  evaluatorsAtCapacity: string[];
}

export interface QueueItem {
  assignmentId: string;
  sheetId: string;
  filename: string;
  pdfUrl: string;
  dueDate: string;
  status: 'assigned' | 'in_progress' | 'submitted';
  assignedAt: string;
  startedAt: string | null;
}

export interface SheetStatusUpdateResponse {
  message: string;
  sheetId: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
}

export interface EvaluatorStats {
  evaluatorId: string;
  name: string;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  completionPct: number;
}

export interface UploadResponse {
  message: string;
  sheet: {
    id: string;
    filename: string;
    pdfUrl: string;
    dueDate: string;
    status: string;
    uploadedAt: string;
  };
}

export type SheetStatusFilter = 'unassigned' | 'assigned' | 'in_progress' | 'submitted';

export interface SheetItem {
  id: string;
  filename: string;
  pdfUrl: string;
  dueDate: string;
  status: SheetStatusFilter;
  uploadedAt: string;
  assignedTo: string | null;
  assignedAt: string | null;
}

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('eaq_token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json();

  if (!response.ok) {
    const apiError: ApiError = {
      error: body.error || 'An unexpected error occurred',
      code: body.code || 'UNKNOWN_ERROR',
      details: body.details,
    };
    throw apiError;
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/login — Authenticate and receive a JWT token.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  return handleResponse<LoginResponse>(response);
}

/**
 * POST /api/assign — Trigger the assignment engine (coordinator only).
 */
export async function triggerAssign(): Promise<AssignResponse> {
  const response = await fetch(`${API_BASE}/api/assign`, {
    method: 'POST',
    headers: authHeaders(),
  });

  return handleResponse<AssignResponse>(response);
}

/**
 * GET /api/queue/:evaluatorId — Fetch evaluator's personal queue.
 */
export async function getQueue(evaluatorId: string): Promise<QueueItem[]> {
  const response = await fetch(`${API_BASE}/api/queue/${evaluatorId}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  return handleResponse<QueueItem[]>(response);
}

/**
 * PATCH /api/sheet/:id/status — Update a sheet's status (evaluator only).
 */
export async function updateSheetStatus(
  sheetId: string,
  status: 'in_progress' | 'submitted'
): Promise<SheetStatusUpdateResponse> {
  const response = await fetch(`${API_BASE}/api/sheet/${sheetId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });

  return handleResponse<SheetStatusUpdateResponse>(response);
}

/**
 * GET /api/dashboard/stats — Fetch per-evaluator statistics (coordinator only).
 */
export async function getDashboardStats(): Promise<EvaluatorStats[]> {
  const response = await fetch(`${API_BASE}/api/dashboard/stats`, {
    method: 'GET',
    headers: authHeaders(),
  });

  return handleResponse<EvaluatorStats[]>(response);
}

/**
 * GET /api/sheets?status=<status> — Fetch all sheets, optionally filtered by status.
 */
export async function getSheets(status?: SheetStatusFilter): Promise<SheetItem[]> {
  const url = status
    ? `${API_BASE}/api/sheets?status=${status}`
    : `${API_BASE}/api/sheets`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(),
  });

  return handleResponse<SheetItem[]>(response);
}

/**
 * POST /api/upload — Upload a PDF answer sheet (coordinator only).
 * Uses FormData instead of JSON since we're uploading a file.
 */
export async function uploadSheet(
  file: File,
  dueDate?: string
): Promise<UploadResponse> {
  const token = getToken();
  const formData = new FormData();
  formData.append('pdf', file);
  if (dueDate) {
    formData.append('due_date', dueDate);
  }

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Do NOT set Content-Type — fetch sets it automatically with the boundary for FormData

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  return handleResponse<UploadResponse>(response);
}
