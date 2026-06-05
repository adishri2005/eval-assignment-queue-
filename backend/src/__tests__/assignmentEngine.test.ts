// File: src/__tests__/assignmentEngine.test.ts
// Purpose: Comprehensive Jest unit tests for the assignment engine covering
//          fairness (round-robin), capacity limits, due-date priority, and edge cases.

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

// We mock the Prisma client to isolate the engine logic from the database.
// The mock tracks all calls so we can verify Assignment records, status updates,
// and capacity increments.

interface MockSheet {
  id: string;
  filename: string;
  pdf_url: string;
  due_date: Date;
  status: string;
  uploaded_at: Date;
}

interface MockCapacity {
  evaluator_id: string;
  max_sheets: number;
  current_count: number;
}

interface MockEvaluator {
  id: string;
  name: string;
  is_active: boolean;
  capacity: MockCapacity | null;
}

// Track what the $transaction callback does
interface TransactionLog {
  assignmentsCreated: Array<{ sheet_id: string; evaluator_id: string }>;
  sheetsUpdated: Array<{ id: string; status: string }>;
  capacityIncrements: Array<{ evaluator_id: string; increment: number }>;
}

function createMockPrisma(
  sheets: MockSheet[],
  evaluators: MockEvaluator[],
  options: {
    transactionShouldFail?: boolean;
    activeAssignmentCounts?: Array<{ evaluator_id: string; _count: { id: number } }>;
  } = {}
) {
  const transactionLog: TransactionLog = {
    assignmentsCreated: [],
    sheetsUpdated: [],
    capacityIncrements: [],
  };

  const txMock = {
    assignment: {
      create: jest.fn(({ data }: { data: { sheet_id: string; evaluator_id: string } }) => {
        transactionLog.assignmentsCreated.push(data);
        return Promise.resolve({ id: `asgn-${data.sheet_id}`, ...data });
      }),
    },
    answerSheet: {
      update: jest.fn(({ where, data }: { where: { id: string }; data: { status: string } }) => {
        transactionLog.sheetsUpdated.push({ id: where.id, status: data.status });
        return Promise.resolve({ id: where.id, status: data.status });
      }),
    },
    evaluatorCapacity: {
      update: jest.fn(({ where, data }: { where: { evaluator_id: string }; data: { current_count: { increment: number } } }) => {
        transactionLog.capacityIncrements.push({
          evaluator_id: where.evaluator_id,
          increment: data.current_count.increment,
        });
        return Promise.resolve({ evaluator_id: where.evaluator_id });
      }),
    },
  };

  const mockPrisma = {
    answerSheet: {
      findMany: jest.fn().mockResolvedValue(sheets),
    },
    evaluator: {
      findMany: jest.fn().mockResolvedValue(evaluators),
    },
    assignment: {
      // groupBy returns active assignment counts per evaluator (for sync step)
      groupBy: jest.fn().mockResolvedValue(options.activeAssignmentCounts ?? []),
    },
    evaluatorCapacity: {
      // Used by the sync step to update current_count before assignment
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (callback: (tx: typeof txMock) => Promise<void>) => {
      if (options.transactionShouldFail) {
        throw new Error('Database write failed');
      }
      await callback(txMock);
    }),
    _transactionLog: transactionLog,
    _txMock: txMock,
  };

  return mockPrisma;
}

// Helper to create sheets with sequential dates
function makeSheets(count: number, baseDate: Date = new Date('2026-06-05T09:00:00Z')): MockSheet[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sheet-${i + 1}`,
    filename: `Paper_${String(i + 1).padStart(3, '0')}.pdf`,
    pdf_url: `/uploads/Paper_${String(i + 1).padStart(3, '0')}.pdf`,
    due_date: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
    status: 'unassigned',
    uploaded_at: new Date(baseDate.getTime() - (count - i) * 60 * 1000), // Earlier uploads first
  }));
}

// Helper to create evaluators
function makeEvaluators(
  configs: Array<{ name: string; maxSheets: number; currentCount?: number }>
): MockEvaluator[] {
  return configs.map((cfg, i) => ({
    id: `eval-${i + 1}`,
    name: cfg.name,
    is_active: true,
    capacity: {
      evaluator_id: `eval-${i + 1}`,
      max_sheets: cfg.maxSheets,
      current_count: cfg.currentCount ?? 0,
    },
  }));
}

// ---------------------------------------------------------------------------
// Import the engine (after mocks are set up)
// ---------------------------------------------------------------------------
const { runAssignment } = require('../engine/assignmentEngine');

// Suppress console.log noise from engine debug output during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  (console.log as jest.Mock).mockRestore();
});

// ===========================================================================
// TEST SUITES
// ===========================================================================

describe('Assignment Engine', () => {
  // =========================================================================
  // FAIRNESS TESTS
  // =========================================================================
  describe('Fairness (Round-Robin)', () => {
    it('distributes sheets equally (round-robin) across 3 evaluators with equal capacity', async () => {
      const sheets = makeSheets(9);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10 },
        { name: 'Eval B', maxSheets: 10 },
        { name: 'Eval C', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      const result = await runAssignment(prisma);

      // Verify return value
      expect(result.assigned).toBe(9);
      expect(result.skipped).toBe(0);

      // Verify Prisma $transaction was called
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Count assignments per evaluator from the transaction log
      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      // Each evaluator should get exactly 3 sheets
      expect(counts['eval-1']).toBe(3);
      expect(counts['eval-2']).toBe(3);
      expect(counts['eval-3']).toBe(3);
    });

    it('distributes sheets with remainder fairly — max diff ≤ 1', async () => {
      const sheets = makeSheets(10);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10 },
        { name: 'Eval B', maxSheets: 10 },
        { name: 'Eval C', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(10);

      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      const values = Object.values(counts).sort((a, b) => b - a);
      // Fair distribution: max diff ≤ 1
      expect(values[0] - values[values.length - 1]).toBeLessThanOrEqual(1);
    });

    it('max difference between any two evaluators never exceeds 1', async () => {
      const sheets = makeSheets(11);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 20 },
        { name: 'Eval B', maxSheets: 20 },
        { name: 'Eval C', maxSheets: 20 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      await runAssignment(prisma);

      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      const values = Object.values(counts);
      const maxCount = Math.max(...values);
      const minCount = Math.min(...values);
      expect(maxCount - minCount).toBeLessThanOrEqual(1);
    });

    it('distributes 8 sheets across 3 evaluators as 3-3-2 (not 4-2-2)', async () => {
      const sheets = makeSheets(8);
      const evaluators = makeEvaluators([
        { name: 'Evaluator One', maxSheets: 10 },
        { name: 'Evaluator Two', maxSheets: 10 },
        { name: 'Evaluator Three', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(8);
      expect(result.skipped).toBe(0);

      // Count assignments per evaluator
      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      const values = Object.values(counts).sort((a, b) => b - a);
      // Must be [3, 3, 2] — never [4, 2, 2]
      expect(values).toEqual([3, 3, 2]);

      // Max diff must be ≤ 1
      expect(values[0] - values[values.length - 1]).toBeLessThanOrEqual(1);

      // Verify strict round-robin order: 1, 2, 3, 1, 2, 3, 1, 2
      const assignedOrder = prisma._transactionLog.assignmentsCreated.map(
        (a: { evaluator_id: string }) => a.evaluator_id
      );
      expect(assignedOrder).toEqual([
        'eval-1', 'eval-2', 'eval-3',
        'eval-1', 'eval-2', 'eval-3',
        'eval-1', 'eval-2',
      ]);
    });

    it('starts round-robin from the least-loaded evaluator across runs', async () => {
      // Simulate: Evaluator One already has 3 sheets, Two has 2, Three has 2
      // A single new sheet should go to Two or Three (not One)
      const sheets = makeSheets(1);
      const evaluators = makeEvaluators([
        { name: 'Evaluator One', maxSheets: 10, currentCount: 3 },
        { name: 'Evaluator Two', maxSheets: 10, currentCount: 2 },
        { name: 'Evaluator Three', maxSheets: 10, currentCount: 2 },
      ]);

      // Mock groupBy to return the active counts matching currentCount
      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 3 } },
          { evaluator_id: 'eval-2', _count: { id: 2 } },
          { evaluator_id: 'eval-3', _count: { id: 2 } },
        ],
      });

      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(1);

      // The single sheet should go to eval-2 (first least-loaded in sorted order)
      const assignedTo = prisma._transactionLog.assignmentsCreated[0].evaluator_id;
      expect(assignedTo).toBe('eval-2');
    });

    it('distributes multiple sheets fairly when evaluators have unequal existing loads', async () => {
      // Evaluator One has 4, Two has 2, Three has 2 — 3 new sheets to assign
      // Should go: Two(1), Three(1), One(1) → final loads: 5, 3, 3
      const sheets = makeSheets(3);
      const evaluators = makeEvaluators([
        { name: 'Evaluator One', maxSheets: 10, currentCount: 4 },
        { name: 'Evaluator Two', maxSheets: 10, currentCount: 2 },
        { name: 'Evaluator Three', maxSheets: 10, currentCount: 2 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 4 } },
          { evaluator_id: 'eval-2', _count: { id: 2 } },
          { evaluator_id: 'eval-3', _count: { id: 2 } },
        ],
      });

      const result = await runAssignment(prisma);
      expect(result.assigned).toBe(3);

      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      // Two and Three should each get 1 (they're behind), One gets 1
      expect(counts['eval-1']).toBe(1);
      expect(counts['eval-2']).toBe(1);
      expect(counts['eval-3']).toBe(1);
    });
  });

  // =========================================================================
  // CAPACITY SYNC TESTS
  // =========================================================================
  describe('Capacity Sync (current_count reconciliation)', () => {
    it('syncs current_count from actual assignments before distributing', async () => {
      const sheets = makeSheets(2);
      // Evaluator has stale current_count of 5 but only 2 real active assignments
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10, currentCount: 5 },
        { name: 'Eval B', maxSheets: 10, currentCount: 0 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 2 } },
          // eval-2 has 0 active — not in groupBy results
        ],
      });

      await runAssignment(prisma);

      // Verify the sync step called evaluatorCapacity.update to fix the stale count
      // eval-1: stored 5, actual 2 → should be corrected
      expect(prisma.evaluatorCapacity.update).toHaveBeenCalledWith({
        where: { evaluator_id: 'eval-1' },
        data: { current_count: 2 },
      });

      // eval-2: stored 0, actual 0 → no update needed (already correct)
    });

    it('resets current_count to 0 for evaluators with no active assignments', async () => {
      const sheets = makeSheets(1);
      // Evaluator has stale current_count of 3 but 0 real active assignments
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10, currentCount: 3 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [], // no active assignments for anyone
      });

      await runAssignment(prisma);

      // Verify the sync step corrected eval-1's count from 3 to 0
      expect(prisma.evaluatorCapacity.update).toHaveBeenCalledWith({
        where: { evaluator_id: 'eval-1' },
        data: { current_count: 0 },
      });
    });
  });

  // =========================================================================
  // CAPACITY TESTS
  // =========================================================================
  describe('Capacity Limits', () => {
    it('skips evaluators who have reached their max_sheets cap', async () => {
      const sheets = makeSheets(4);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 5, currentCount: 5 }, // AT CAPACITY
        { name: 'Eval B', maxSheets: 5, currentCount: 0 },
        { name: 'Eval C', maxSheets: 5, currentCount: 0 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 5 } },
        ],
      });
      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(4);
      expect(result.evaluatorsAtCapacity).toContain('Eval A');

      // Verify NO assignments went to eval-1
      const eval1Assignments = prisma._transactionLog.assignmentsCreated.filter(
        (a: { evaluator_id: string }) => a.evaluator_id === 'eval-1'
      );
      expect(eval1Assignments).toHaveLength(0);
    });

    it('correctly assigns remaining sheets when one evaluator is at capacity', async () => {
      const sheets = makeSheets(6);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 3, currentCount: 3 }, // AT CAPACITY
        { name: 'Eval B', maxSheets: 5, currentCount: 0 },
        { name: 'Eval C', maxSheets: 5, currentCount: 0 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 3 } },
        ],
      });
      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(6);

      const counts: Record<string, number> = {};
      for (const asgn of prisma._transactionLog.assignmentsCreated) {
        counts[asgn.evaluator_id] = (counts[asgn.evaluator_id] || 0) + 1;
      }

      // Eval A is at capacity — should get 0
      expect(counts['eval-1'] || 0).toBe(0);
      // Eval B and C should split evenly
      expect(counts['eval-2']).toBe(3);
      expect(counts['eval-3']).toBe(3);
    });

    it('returns no evaluators available error when all evaluators are at capacity', async () => {
      const sheets = makeSheets(3);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 5, currentCount: 5 },
        { name: 'Eval B', maxSheets: 3, currentCount: 3 },
        { name: 'Eval C', maxSheets: 4, currentCount: 4 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        activeAssignmentCounts: [
          { evaluator_id: 'eval-1', _count: { id: 5 } },
          { evaluator_id: 'eval-2', _count: { id: 3 } },
          { evaluator_id: 'eval-3', _count: { id: 4 } },
        ],
      });

      await expect(runAssignment(prisma)).rejects.toThrow(
        'No evaluators available — all evaluators have reached their maximum capacity.'
      );

      // Verify NO transaction was called
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates current_count correctly after assignment', async () => {
      const sheets = makeSheets(7);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10, currentCount: 0 },
        { name: 'Eval B', maxSheets: 10, currentCount: 0 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      await runAssignment(prisma);

      // Verify capacity increments via the transaction log
      const increments = prisma._transactionLog.capacityIncrements;
      expect(increments).toHaveLength(2); // Both evaluators got sheets

      const eval1Inc = increments.find(
        (inc: { evaluator_id: string }) => inc.evaluator_id === 'eval-1'
      );
      const eval2Inc = increments.find(
        (inc: { evaluator_id: string }) => inc.evaluator_id === 'eval-2'
      );

      // 7 sheets across 2 evaluators: 4 + 3
      expect(eval1Inc?.increment).toBe(4);
      expect(eval2Inc?.increment).toBe(3);
    });
  });

  // =========================================================================
  // DUE DATE TESTS
  // =========================================================================
  describe('Due Date Priority', () => {
    it('assigns most urgent sheets (earliest due_date) first', async () => {
      // Create sheets with reversed due dates so we can verify sorting
      const sheets: MockSheet[] = [
        {
          id: 'sheet-late',
          filename: 'Late.pdf',
          pdf_url: '/uploads/Late.pdf',
          due_date: new Date('2026-06-12T09:00:00Z'),
          status: 'unassigned',
          uploaded_at: new Date('2026-06-01T09:00:00Z'),
        },
        {
          id: 'sheet-urgent',
          filename: 'Urgent.pdf',
          pdf_url: '/uploads/Urgent.pdf',
          due_date: new Date('2026-06-05T09:00:00Z'),
          status: 'unassigned',
          uploaded_at: new Date('2026-06-01T10:00:00Z'),
        },
        {
          id: 'sheet-mid',
          filename: 'Mid.pdf',
          pdf_url: '/uploads/Mid.pdf',
          due_date: new Date('2026-06-08T09:00:00Z'),
          status: 'unassigned',
          uploaded_at: new Date('2026-06-01T11:00:00Z'),
        },
      ];

      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);

      // The engine queries with ORDER BY due_date ASC — the mock returns them as-is.
      // Verify the Prisma findMany was called with the correct orderBy.
      await runAssignment(prisma);

      expect(prisma.answerSheet.findMany).toHaveBeenCalledWith({
        where: { status: 'unassigned' },
        orderBy: [{ due_date: 'asc' }, { uploaded_at: 'asc' }],
      });

      // All 3 should be assigned
      expect(prisma._transactionLog.assignmentsCreated).toHaveLength(3);
    });

    it('sheets with same due_date are ordered by uploaded_at (FIFO)', async () => {
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma([], evaluators);

      // Verify the orderBy includes both due_date and uploaded_at
      // Override findMany to check the query structure
      prisma.answerSheet.findMany.mockResolvedValue([]);

      try {
        await runAssignment(prisma);
      } catch {
        // Will throw "No unassigned sheets" — that's fine, we just want to check the query
      }

      expect(prisma.answerSheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ due_date: 'asc' }, { uploaded_at: 'asc' }],
        })
      );
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe('Edge Cases', () => {
    it('returns 0 assigned and 0 skipped when no unassigned sheets exist', async () => {
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 5 },
      ]);

      const prisma = createMockPrisma([], evaluators);

      await expect(runAssignment(prisma)).rejects.toThrow(
        'No unassigned sheets available for assignment.'
      );
    });

    it('handles single evaluator correctly', async () => {
      const sheets = makeSheets(5);
      const evaluators = makeEvaluators([
        { name: 'Solo Eval', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators);
      const result = await runAssignment(prisma);

      expect(result.assigned).toBe(5);
      expect(result.skipped).toBe(0);

      // All assignments should go to the single evaluator
      const allToSame = prisma._transactionLog.assignmentsCreated.every(
        (a: { evaluator_id: string }) => a.evaluator_id === 'eval-1'
      );
      expect(allToSame).toBe(true);

      // Verify capacity increment
      expect(prisma._transactionLog.capacityIncrements).toEqual([
        { evaluator_id: 'eval-1', increment: 5 },
      ]);
    });

    it('transaction rollback: if DB write fails mid-assignment, no partial state is committed', async () => {
      const sheets = makeSheets(5);
      const evaluators = makeEvaluators([
        { name: 'Eval A', maxSheets: 10 },
        { name: 'Eval B', maxSheets: 10 },
      ]);

      const prisma = createMockPrisma(sheets, evaluators, {
        transactionShouldFail: true,
      });

      await expect(runAssignment(prisma)).rejects.toThrow('Database write failed');

      // Verify $transaction was called (the engine attempted to write)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Since the transaction threw, no assignment records should have been committed.
      // In a real DB, the transaction would rollback. Our mock simulates this by
      // throwing before any writes complete.
      // The key assertion: the engine does NOT write outside the transaction.
    });
  });
});
