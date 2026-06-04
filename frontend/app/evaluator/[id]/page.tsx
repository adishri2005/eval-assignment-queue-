// File: app/evaluator/[id]/page.tsx
// Purpose: Evaluator Queue page — displays personal assignment queue as a table
//          with Start/Submit actions, optimistic updates, and confirmation dialog.
//          Full accessibility: ARIA modal, keyboard trap, semantic HTML, skeletons.

'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollExperience from '@/components/ScrollExperience';
import { getQueue, updateSheetStatus } from '@/lib/api';
import type { QueueItem, ApiError } from '@/lib/api';
import { toggleTheme, getTheme } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Status badge component
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const badgeVariants: Record<string, string> = {
    assigned: 'badge--assigned',
    in_progress: 'badge--in-progress',
    submitted: 'badge--submitted',
    unassigned: 'badge--unassigned',
  };

  const labels: Record<string, string> = {
    assigned: 'Pending',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    unassigned: 'Unassigned',
  };

  return (
    <span className={`badge ${badgeVariants[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton
// ---------------------------------------------------------------------------
function QueueSkeleton() {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-row__cell--icon" />
          <div className="skeleton skeleton-row__cell" />
          <div className="skeleton skeleton-row__cell--sm skeleton" />
          <div className="skeleton skeleton-row__cell--badge skeleton" />
          <div className="skeleton skeleton-row__cell--sm skeleton" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accessible Confirmation Dialog — keyboard trap + ARIA
// ---------------------------------------------------------------------------
function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  isLoading: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap: focus the cancel button when dialog opens, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Delay focus to after render
      requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Keyboard handler: Escape to close, Tab to cycle between buttons
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [isLoading, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={isLoading ? undefined : onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-dialog-title" className="modal__title">{title}</h3>
        <p id="confirm-dialog-desc" className="modal__description">{description}</p>
        <div className="modal__actions">
          <button
            ref={cancelRef}
            id="confirm-dialog-cancel"
            onClick={onClose}
            disabled={isLoading}
            className="btn btn--ghost"
            type="button"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            id="confirm-dialog-submit"
            onClick={onConfirm}
            disabled={isLoading}
            className={`btn btn--success ${isLoading ? 'btn--loading' : ''}`}
            type="button"
            aria-busy={isLoading}
          >
            <span className="btn__label">
              {isLoading ? 'Submitting...' : 'Confirm Submit'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Queue Component
// ---------------------------------------------------------------------------
function EvaluatorQueue() {
  const params = useParams();
  const evaluatorId = params.id as string;
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const [isNavScrolled, setIsNavScrolled] = useState(false);

  // Confirmation dialog state
  const [confirmSheet, setConfirmSheet] = useState<QueueItem | null>(null);

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

  // ----- Queue query -----
  const {
    data: queue,
    isLoading,
    error,
  } = useQuery<QueueItem[], ApiError>({
    queryKey: ['evaluator-queue', evaluatorId],
    queryFn: () => getQueue(evaluatorId),
    refetchInterval: 30_000,
  });

  // ----- Status update mutation with optimistic updates -----
  const statusMutation = useMutation({
    mutationFn: ({
      sheetId,
      status,
    }: {
      sheetId: string;
      status: 'in_progress' | 'submitted';
    }) => updateSheetStatus(sheetId, status),

    onMutate: async ({ sheetId, status }) => {
      await queryClient.cancelQueries({
        queryKey: ['evaluator-queue', evaluatorId],
      });

      const previousQueue = queryClient.getQueryData<QueueItem[]>([
        'evaluator-queue',
        evaluatorId,
      ]);

      queryClient.setQueryData<QueueItem[]>(
        ['evaluator-queue', evaluatorId],
        (old) => {
          if (!old) return old;
          if (status === 'submitted') {
            return old.filter((item) => item.sheetId !== sheetId);
          }
          return old.map((item) =>
            item.sheetId === sheetId
              ? { ...item, status, startedAt: new Date().toISOString() }
              : item
          );
        }
      );

      return { previousQueue };
    },

    onError: (err: ApiError, _variables, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(
          ['evaluator-queue', evaluatorId],
          context.previousQueue
        );
      }
      toast.error('Update failed', { description: err.error });
    },

    onSuccess: (_data, variables) => {
      const action =
        variables.status === 'in_progress' ? 'started' : 'submitted';
      toast.success(`Sheet ${action} successfully!`);
      queryClient.invalidateQueries({
        queryKey: ['evaluator-queue', evaluatorId],
      });
    },
  });

  function handleStart(sheetId: string) {
    statusMutation.mutate({ sheetId, status: 'in_progress' });
  }

  function handleSubmitConfirm() {
    if (!confirmSheet) return;
    statusMutation.mutate(
      { sheetId: confirmSheet.sheetId, status: 'submitted' },
      { onSettled: () => setConfirmSheet(null) }
    );
  }

  return (
    <div className="page">
      <ScrollExperience />

      {/* Navbar */}
      <nav className={`navbar ${isNavScrolled ? 'navbar--scrolled' : ''}`} aria-label="Main navigation">
        <div className="navbar__inner" style={{ maxWidth: 'var(--max-width-narrow)' }}>
          <div className="navbar__brand">
            <span className="navbar__logo" aria-hidden="true">EAQ</span>
            <span className="navbar__title">My Queue</span>
          </div>
          <div className="navbar__actions">
            <span className="badge badge--role hide-xs" aria-label="Role: Evaluator">Evaluator</span>
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
              id="evaluator-logout-btn"
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
        <div className="container container--narrow">
          {/* Loading state with skeleton */}
          {isLoading && (
            <section aria-label="Assignment queue" role="status">
              <span className="sr-only">Loading your queue...</span>
              <div className="card card--static">
                <div className="card__header">
                  <div className="skeleton skeleton--text-lg" style={{ width: '180px' }} />
                </div>
                <QueueSkeleton />
              </div>
            </section>
          )}

          {/* Error state */}
          {error && (
            <section aria-label="Error">
              <article className="card card--static empty-state" role="alert">
                <div className="empty-state__icon-wrap">
                  <svg className="empty-state__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="empty-state__title">Couldn't load queue</h2>
                <p className="empty-state__text">{error.error || 'Something went wrong. Please try again.'}</p>
                <button
                  className="btn btn--secondary"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['evaluator-queue', evaluatorId] })}
                  type="button"
                  style={{ marginTop: 'var(--space-4)' }}
                >
                  Try again
                </button>
              </article>
            </section>
          )}

          {/* Empty state */}
          {!isLoading && !error && queue && queue.length === 0 && (
            <section aria-label="Empty queue">
              <article className="card card--static empty-state anim-fade-in">
                <div className="empty-state__icon-wrap">
                  <svg
                    className="empty-state__icon"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                </div>
                <h2 className="empty-state__title">
                  No sheets assigned to you yet
                </h2>
                <p className="empty-state__text">
                  Check back after the coordinator runs the assignment engine.
                </p>
              </article>
            </section>
          )}

          {/* Queue Table */}
          {!isLoading && queue && queue.length > 0 && (
            <section aria-label="Assignment queue">
              <article className="card card--static anim-fade-in">
                <div className="card__header flex--between">
                  <h2 className="card__header-title">Assignment Queue</h2>
                  <span className="text-sm text-tertiary" aria-live="polite">
                    {queue.length} sheet{queue.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="table-container">
                  <table className="table table--responsive" id="queue-table" aria-label="Your assigned answer sheets">
                    <thead className="table__head">
                      <tr className="table__head-row">
                        <th className="table__th" scope="col">Sheet Name</th>
                        <th className="table__th" scope="col">Due Date</th>
                        <th className="table__th table__th--center" scope="col">Status</th>
                        <th className="table__th table__th--right" scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((item) => (
                        <tr
                          key={item.assignmentId}
                          className="table__row"
                        >
                          <td className="table__td" data-label="Sheet">
                            <div className="table__file-cell">
                              <div className="table__file-icon" aria-hidden="true">
                                <svg
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                                  />
                                </svg>
                              </div>
                              <span className="table__filename">{item.filename}</span>
                            </div>
                          </td>
                          <td className="table__td table__td--muted" data-label="Due">
                            <time dateTime={item.dueDate}>{formatDate(item.dueDate)}</time>
                          </td>
                          <td className="table__td table__td--center" data-label="Status">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="table__td table__td--right" data-label="Actions">
                            <div className="table__actions">
                              {item.status === 'assigned' && (
                                <button
                                  id={`start-btn-${item.sheetId}`}
                                  onClick={() => handleStart(item.sheetId)}
                                  disabled={statusMutation.isPending}
                                  className="btn btn--secondary btn--sm"
                                  type="button"
                                  aria-label={`Start evaluating ${item.filename}`}
                                >
                                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5,3 19,12 5,21" />
                                  </svg>
                                  Start
                                </button>
                              )}
                              {item.status === 'in_progress' && (
                                <button
                                  id={`submit-btn-${item.sheetId}`}
                                  onClick={() => setConfirmSheet(item)}
                                  disabled={statusMutation.isPending}
                                  className="btn btn--success btn--sm"
                                  type="button"
                                  aria-label={`Submit ${item.filename}`}
                                >
                                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                    <polyline points="20,6 9,17 4,12" />
                                  </svg>
                                  Submit
                                </button>
                              )}
                              {item.status === 'assigned' && (
                                <span className="text-xs text-tertiary">
                                  Not started
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          )}
        </div>
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmSheet}
        onClose={() => setConfirmSheet(null)}
        onConfirm={handleSubmitConfirm}
        title="Submit Answer Sheet"
        description={`Are you sure you want to submit "${confirmSheet?.filename}"? This action cannot be undone.`}
        isLoading={statusMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapped with ProtectedRoute
// ---------------------------------------------------------------------------
export default function EvaluatorPage() {
  const params = useParams();
  const evaluatorId = params.id as string;

  return (
    <ProtectedRoute requiredRole="evaluator" evaluatorId={evaluatorId}>
      <EvaluatorQueue />
    </ProtectedRoute>
  );
}
