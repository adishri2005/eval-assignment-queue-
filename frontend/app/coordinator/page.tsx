// File: app/coordinator/page.tsx
// Purpose: Coordinator Dashboard — upload PDFs, trigger assignment, view live
//          progress stats with metric cards, Chart.js chart, and data table.
//          Metric cards are clickable filters that show the sheets list panel.
//          Auto-refetches every 30s via TanStack Query.
//          Full accessibility: ARIA, semantic HTML, keyboard nav, skeleton loading.

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollExperience from '@/components/ScrollExperience';
import CompletionChart from '@/components/CompletionChart';
import {
  getDashboardStats,
  triggerAssign,
  uploadSheet,
  getSheets,
} from '@/lib/api';
import type { EvaluatorStats, SheetItem, SheetStatusFilter, ApiError } from '@/lib/api';
import { toggleTheme, getTheme } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Status filter mapping — maps card labels to API status values
// ---------------------------------------------------------------------------
type FilterKey = SheetStatusFilter | 'all';

const METRIC_TO_STATUS: Record<string, FilterKey> = {
  'Total Sheets': 'all',
  'Assigned': 'assigned',
  'In Progress': 'in_progress',
  'Submitted': 'submitted',
};

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    unassigned: { cls: 'badge--unassigned', label: 'Unassigned' },
    assigned:   { cls: 'badge--assigned',   label: 'Assigned' },
    in_progress:{ cls: 'badge--in-progress',label: 'In Progress' },
    submitted:  { cls: 'badge--submitted',  label: 'Submitted' },
  };
  const info = map[status] || { cls: '', label: status };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------
function StatsSkeleton() {
  return (
    <div className="skeleton-stats" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton skeleton-stat" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-row__cell" />
          <div className="skeleton skeleton-row__cell--sm skeleton" />
          <div className="skeleton skeleton-row__cell--badge skeleton" />
          <div className="skeleton skeleton-row__cell--badge skeleton" />
          <div className="skeleton skeleton-row__cell--badge skeleton" />
          <div className="skeleton skeleton-row__cell" />
        </div>
      ))}
    </div>
  );
}

function SheetsTableSkeleton() {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-row__cell" />
          <div className="skeleton skeleton-row__cell--sm skeleton" />
          <div className="skeleton skeleton-row__cell--badge skeleton" />
          <div className="skeleton skeleton-row__cell" />
          <div className="skeleton skeleton-row__cell--sm skeleton" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function CoordinatorDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const [isNavScrolled, setIsNavScrolled] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);

  // Hydrate theme on mount
  useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  // Navbar scroll listener (rAF-throttled)
  useEffect(() => {
    let rafId: number | null = null;
    function handleScroll() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        setIsNavScrolled(window.scrollY > 10);
        rafId = null;
      });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  function handleThemeToggle() {
    const next = toggleTheme();
    setCurrentTheme(next);
  }

  // ----- Stats query (auto-refetch every 30s) -----
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<EvaluatorStats[], ApiError>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 30_000,
  });

  // ----- Sheets query — only fetches when a filter is active -----
  const sheetsQueryStatus = activeFilter === 'all' ? undefined : (activeFilter as SheetStatusFilter | undefined);

  const {
    data: sheets,
    isLoading: sheetsLoading,
    error: sheetsError,
  } = useQuery<SheetItem[], ApiError>({
    queryKey: ['sheets', activeFilter],
    queryFn: () => getSheets(sheetsQueryStatus),
    enabled: activeFilter !== null,
  });

  // ----- Assignment mutation -----
  const assignMutation = useMutation({
    mutationFn: triggerAssign,
    onSuccess: (data) => {
      toast.success(`${data.assigned} sheet(s) assigned!`, {
        description:
          data.evaluatorsAtCapacity.length > 0
            ? `Evaluators at capacity: ${data.evaluatorsAtCapacity.join(', ')}`
            : 'All evaluators have available capacity.',
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      // Also refresh the sheets list if a filter is active
      if (activeFilter !== null) {
        queryClient.invalidateQueries({ queryKey: ['sheets'] });
      }
    },
    onError: (err: ApiError) => {
      toast.error('Assignment failed', { description: err.error });
    },
  });

  // ----- File upload state -----
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDueDate, setUploadDueDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        toast.error('Invalid file type', { description: 'Only PDF files are allowed.' });
        return;
      }

      setIsUploading(true);
      try {
        const result = await uploadSheet(file, uploadDueDate || undefined);
        toast.success('Upload successful!', {
          description: `${result.sheet.filename} uploaded.`,
        });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        if (activeFilter !== null) {
          queryClient.invalidateQueries({ queryKey: ['sheets'] });
        }
        setUploadDueDate('');
      } catch (err) {
        const apiError = err as ApiError;
        toast.error('Upload failed', { description: apiError.error });
      } finally {
        setIsUploading(false);
      }
    },
    [uploadDueDate, queryClient, activeFilter]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = '';
    },
    [handleUpload]
  );

  // Handle keyboard activation on drop zone
  function handleDropZoneKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }

  // ----- Compute aggregate metrics -----
  const totalSheets = stats?.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const totalCompleted = stats?.reduce((sum, s) => sum + s.completed, 0) ?? 0;
  const totalInProgress = stats?.reduce((sum, s) => sum + s.inProgress, 0) ?? 0;
  const totalPending = stats?.reduce((sum, s) => sum + s.pending, 0) ?? 0;

  const metrics = [
    { label: 'Total Sheets', value: totalSheets, icon: '📄', variant: 'accent' },
    { label: 'Assigned', value: totalPending, icon: '📌', variant: 'info' },
    { label: 'In Progress', value: totalInProgress, icon: '⏳', variant: 'warning' },
    { label: 'Submitted', value: totalCompleted, icon: '✅', variant: 'success' },
  ];

  // ----- Handle metric card click -----
  function handleMetricClick(label: string) {
    const filterKey = METRIC_TO_STATUS[label];
    if (!filterKey) return;
    // Toggle: clicking the active card deselects it
    setActiveFilter((prev) => (prev === filterKey ? null : filterKey));
  }

  // Filter label for display
  const filterLabels: Record<FilterKey, string> = {
    all: 'All Sheets',
    unassigned: 'Unassigned',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    submitted: 'Submitted',
  };

  return (
    <div className="page">
      <ScrollExperience />

      {/* Navbar */}
      <nav className={`navbar ${isNavScrolled ? 'navbar--scrolled' : ''}`} aria-label="Main navigation">
        <div className="navbar__inner">
          <div className="navbar__brand">
            <span className="navbar__logo" aria-hidden="true">EAQ</span>
            <span className="navbar__title">Coordinator Dashboard</span>
          </div>
          <div className="navbar__actions">
            <span className="badge badge--role hide-xs" aria-label="Role: Coordinator">Coordinator</span>
            <button
              className="theme-toggle"
              onClick={handleThemeToggle}
              aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
              type="button"
            >
              {currentTheme === 'light' ? (
                <svg className="theme-toggle__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="theme-toggle__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
            <button
              id="logout-btn"
              onClick={logout}
              className="btn btn--ghost"
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="main" id="main-content">
        <div className="container">
          {/* ---- Action Row: Assign + Upload ---- */}
          <section className="main__section" aria-label="Actions">
            <div className="grid grid--2">
              {/* Assign Card */}
              <article className="card card__body anim-fade-in">
                <h2 className="card__header-title">Trigger Assignment</h2>
                <p className="card__description">
                  Distribute all unassigned sheets to evaluators using the fair round-robin algorithm.
                </p>
                <button
                  id="assign-btn"
                  onClick={() => assignMutation.mutate()}
                  disabled={assignMutation.isPending}
                  className={`btn btn--primary btn--full btn--lg neuro ${assignMutation.isPending ? 'btn--loading' : ''}`}
                  type="button"
                  aria-busy={assignMutation.isPending}
                >
                  <span className="btn__label">
                    {assignMutation.isPending ? (
                      <>
                        <span className="spinner spinner--sm" aria-hidden="true" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Assign Sheets
                      </>
                    )}
                  </span>
                </button>
              </article>

              {/* Upload Card */}
              <article className="card card__body anim-fade-in anim-delay-1">
                <h2 className="card__header-title">Upload Answer Sheet</h2>

                <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                  <label htmlFor="due-date-input" className="input-label">
                    Due Date (optional)
                  </label>
                  <input
                    id="due-date-input"
                    type="date"
                    value={uploadDueDate}
                    onChange={(e) => setUploadDueDate(e.target.value)}
                    className="input input--date"
                  />
                </div>

                {/* Drop zone — keyboard accessible */}
                <div
                  id="upload-dropzone"
                  role="button"
                  tabIndex={0}
                  aria-label={isUploading ? 'Uploading file' : 'Upload a PDF file. Drag and drop or press Enter to browse.'}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={handleDropZoneKeyDown}
                  className={`skeu-tray upload-zone ${isDragging ? 'skeu-tray--active' : ''} ${isUploading ? 'upload-zone--disabled' : ''}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    id="file-input"
                    tabIndex={-1}
                    style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
                    aria-label="Choose a PDF file to upload"
                  />
                  <svg className="upload-zone__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p className="upload-zone__label">
                    {isUploading ? 'Uploading...' : 'Drop a PDF here or click to browse'}
                  </p>
                  <p className="upload-zone__hint">Max 10MB • PDF only</p>
                </div>
              </article>
            </div>
          </section>

          {/* ---- Clickable Metric Cards ---- */}
          <section className="main__section" aria-label="Statistics overview">
            {statsLoading ? (
              <div role="status" aria-label="Loading statistics">
                <span className="sr-only">Loading statistics...</span>
                <StatsSkeleton />
              </div>
            ) : (
              <div className="grid grid--4" role="group" aria-label="Filter sheets by status">
                {metrics.map((metric, i) => {
                  const filterKey = METRIC_TO_STATUS[metric.label];
                  const isActive = activeFilter === filterKey;

                  return (
                    <button
                      key={metric.label}
                      type="button"
                      onClick={() => handleMetricClick(metric.label)}
                      className={`stat-card stat-card--interactive neuro anim-fade-in anim-delay-${i + 1} ${isActive ? 'stat-card--active' : ''}`}
                      aria-pressed={isActive}
                      aria-label={`${metric.label}: ${metric.value}. Click to ${isActive ? 'clear filter' : 'filter sheets'}.`}
                    >
                      <div className="stat-card__header">
                        <span className="stat-card__icon" aria-hidden="true">{metric.icon}</span>
                        <span className={`badge badge--metric badge--metric-${metric.variant}`}>
                          {metric.value}
                        </span>
                      </div>
                      <p className="stat-card__label">{metric.label}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Sheets List Panel (visible when a filter is active) ---- */}
          {activeFilter !== null && (
            <section className="main__section anim-fade-in" aria-label="Filtered sheets list">
              <article className="card card--static">
                <div className="card__header flex--between">
                  <h2 className="card__header-title">
                    {filterLabels[activeFilter]}
                  </h2>
                  <div className="card__header-actions">
                    <span className="text-sm text-tertiary" aria-live="polite">
                      {!sheetsLoading && sheets ? `${sheets.length} sheet${sheets.length !== 1 ? 's' : ''}` : ''}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setActiveFilter(null)}
                      type="button"
                      aria-label="Clear filter and hide sheets list"
                    >
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  </div>
                </div>

                {/* Loading skeleton */}
                {sheetsLoading && (
                  <div role="status" aria-label="Loading sheets">
                    <span className="sr-only">Loading sheets...</span>
                    <SheetsTableSkeleton />
                  </div>
                )}

                {/* Error state */}
                {sheetsError && (
                  <div className="card__body" role="alert">
                    <div className="empty-state">
                      <h3 className="empty-state__title">Couldn't load sheets</h3>
                      <p className="empty-state__text">{sheetsError.error}</p>
                      <button
                        className="btn btn--secondary"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['sheets', activeFilter] })}
                        type="button"
                        style={{ marginTop: 'var(--space-4)' }}
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!sheetsLoading && !sheetsError && sheets && sheets.length === 0 && (
                  <div className="card__body">
                    <div className="empty-state">
                      <div className="empty-state__icon-wrap">
                        <svg className="empty-state__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <h3 className="empty-state__title">No sheets found</h3>
                      <p className="empty-state__text">
                        No sheets match the "{filterLabels[activeFilter]}" filter.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sheets data table */}
                {!sheetsLoading && sheets && sheets.length > 0 && (
                  <div className="table-container">
                    <table className="table" id="sheets-table" aria-label={`${filterLabels[activeFilter]} answer sheets`}>
                      <thead className="table__head">
                        <tr className="table__head-row">
                          <th className="table__th" scope="col">Filename</th>
                          <th className="table__th" scope="col">Due Date</th>
                          <th className="table__th table__th--center" scope="col">Status</th>
                          <th className="table__th" scope="col">Assigned To</th>
                          <th className="table__th" scope="col">Assigned At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheets.map((sheet) => (
                          <tr key={sheet.id} className="table__row">
                            <td className="table__td" data-label="Filename">
                              <div className="table__file-cell">
                                <div className="table__file-icon" aria-hidden="true">
                                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                </div>
                                <span className="table__filename">{sheet.filename}</span>
                              </div>
                            </td>
                            <td className="table__td table__td--muted" data-label="Due">
                              <time dateTime={sheet.dueDate}>{formatDate(sheet.dueDate)}</time>
                            </td>
                            <td className="table__td table__td--center" data-label="Status">
                              <StatusBadge status={sheet.status} />
                            </td>
                            <td className="table__td" data-label="Assigned To">
                              {sheet.assignedTo || <span className="text-tertiary">—</span>}
                            </td>
                            <td className="table__td table__td--muted" data-label="Assigned At">
                              {sheet.assignedAt ? (
                                <time dateTime={sheet.assignedAt}>{formatDateTime(sheet.assignedAt)}</time>
                              ) : (
                                <span className="text-tertiary">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </section>
          )}

          {/* ---- Chart Section ---- */}
          {!statsLoading && stats && stats.length > 0 && (
            <section className="main__section" aria-label="Completion chart">
              <article className="card card--static chart-card anim-fade-in anim-delay-2">
                <div className="chart-card__header">
                  <h2 className="chart-card__title">Completion Rate</h2>
                </div>
                <div className="chart-card__body">
                  <CompletionChart stats={stats} />
                </div>
              </article>
            </section>
          )}

          {/* ---- Evaluator Detail Table ---- */}
          <section className="main__section" aria-label="Evaluator breakdown">
            {statsLoading ? (
              <div className="card card--static" role="status" aria-label="Loading evaluator data">
                <div className="card__header">
                  <div className="skeleton skeleton--text-lg" style={{ width: '200px' }} />
                </div>
                <span className="sr-only">Loading evaluator data...</span>
                <TableSkeleton />
              </div>
            ) : statsError ? (
              <article className="card card__body" role="alert">
                <div className="empty-state">
                  <div className="empty-state__icon-wrap">
                    <svg className="empty-state__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <h3 className="empty-state__title">Couldn't load data</h3>
                  <p className="empty-state__text">
                    There was a problem loading evaluator statistics. Please try again.
                  </p>
                  <button
                    className="btn btn--secondary"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })}
                    type="button"
                    style={{ marginTop: 'var(--space-4)' }}
                  >
                    Try again
                  </button>
                </div>
              </article>
            ) : stats && stats.length > 0 ? (
              <article className="card card--static anim-fade-in anim-delay-3">
                <div className="card__header">
                  <h2 className="card__header-title">Evaluator Breakdown</h2>
                </div>
                <div className="table-container">
                  <table className="table" id="stats-table" aria-label="Evaluator statistics">
                    <thead className="table__head">
                      <tr className="table__head-row">
                        <th className="table__th" scope="col">Evaluator</th>
                        <th className="table__th table__th--center" scope="col">Total</th>
                        <th className="table__th table__th--center" scope="col">Pending</th>
                        <th className="table__th table__th--center" scope="col">In Progress</th>
                        <th className="table__th table__th--center" scope="col">Completed</th>
                        <th className="table__th table__th--center" scope="col">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((ev) => (
                        <tr key={ev.evaluatorId} className="table__row">
                          <th className="table__td" scope="row" style={{ fontWeight: 'var(--font-weight-medium)' }}>
                            {ev.name}
                          </th>
                          <td className="table__td table__td--center table__td--muted">
                            {ev.total}
                          </td>
                          <td className="table__td table__td--center">
                            <span className="badge badge--assigned">{ev.pending}</span>
                          </td>
                          <td className="table__td table__td--center">
                            <span className="badge badge--in-progress">{ev.inProgress}</span>
                          </td>
                          <td className="table__td table__td--center">
                            <span className="badge badge--submitted">{ev.completed}</span>
                          </td>
                          <td className="table__td table__td--center">
                            <div className="table__progress">
                              <div
                                className="progress-bar"
                                role="progressbar"
                                aria-valuenow={ev.completionPct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${ev.name} completion: ${ev.completionPct}%`}
                              >
                                <div
                                  className="progress-bar__fill"
                                  style={{ width: `${ev.completionPct}%` }}
                                />
                              </div>
                              <span className="progress-bar__label" aria-hidden="true">
                                {ev.completionPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : (
              <article className="card card--static empty-state anim-fade-in">
                <div className="empty-state__icon-wrap">
                  <svg className="empty-state__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <h3 className="empty-state__title">No evaluator data yet</h3>
                <p className="empty-state__text">
                  Upload answer sheets and trigger assignment to see evaluator statistics here.
                </p>
              </article>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapped with ProtectedRoute
// ---------------------------------------------------------------------------
export default function CoordinatorPage() {
  return (
    <ProtectedRoute requiredRole="coordinator">
      <CoordinatorDashboard />
    </ProtectedRoute>
  );
}
