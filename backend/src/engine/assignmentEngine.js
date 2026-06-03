// File: src/engine/assignmentEngine.js
// Purpose: Fair distribution engine — assigns unassigned answer sheets to evaluators
//          using round-robin cycling, capacity limits, and due-date priority sorting.

/**
 * runAssignment — Implements the assignment algorithm:
 *
 *   Step 1: Sync current_count from actual assignments (prevent stale data)
 *   Step 2: SELECT all AnswerSheets WHERE status = 'unassigned' ORDER BY due_date ASC
 *   Step 3: SELECT all Evaluators with current_count and max_sheets from EvaluatorCapacity
 *   Step 4: Filter out any evaluator WHERE current_count >= max_sheets
 *   Step 5: Round-robin iterate starting from the least-loaded evaluator
 *   Step 6: Write Assignment records + UPDATE sheet status to 'assigned' in a single DB transaction
 *
 * @param {import('@prisma/client').PrismaClient} prisma — Prisma client instance
 * @returns {Promise<{ assigned: number, skipped: number, evaluatorsAtCapacity: string[] }>}
 */
async function runAssignment(prisma) {
  // -------------------------------------------------------------------------
  // Step 1: Sync current_count from actual assignment data (prevents stale counts)
  // -------------------------------------------------------------------------
  const activeCounts = await prisma.assignment.groupBy({
    by: ['evaluator_id'],
    where: {
      sheet: {
        status: { in: ['assigned', 'in_progress'] },
      },
    },
    _count: { id: true },
  });

  // Build a map of evaluator_id → actual active count
  const activeCountMap = new Map();
  for (const row of activeCounts) {
    activeCountMap.set(row.evaluator_id, row._count.id);
  }

  // Fetch all active evaluators to sync their counts
  const allActiveEvaluators = await prisma.evaluator.findMany({
    where: { is_active: true },
    include: { capacity: true },
  });

  // Sync current_count in evaluator_capacities to match reality
  for (const evaluator of allActiveEvaluators) {
    if (evaluator.capacity) {
      const realCount = activeCountMap.get(evaluator.id) || 0;
      if (evaluator.capacity.current_count !== realCount) {
        await prisma.evaluatorCapacity.update({
          where: { evaluator_id: evaluator.id },
          data: { current_count: realCount },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Fetch all unassigned sheets ordered by due_date ASC, then uploaded_at ASC (FIFO)
  // -------------------------------------------------------------------------
  const unassignedSheets = await prisma.answerSheet.findMany({
    where: { status: 'unassigned' },
    orderBy: [
      { due_date: 'asc' },
      { uploaded_at: 'asc' },
    ],
  });

  if (unassignedSheets.length === 0) {
    throw new Error('No unassigned sheets available for assignment.');
  }

  // -------------------------------------------------------------------------
  // Step 3: Re-fetch evaluators with synced capacity data
  // -------------------------------------------------------------------------
  const evaluatorsWithCapacity = await prisma.evaluator.findMany({
    where: { is_active: true },
    include: { capacity: true },
  });

  if (evaluatorsWithCapacity.length === 0) {
    throw new Error('No evaluators available in the system.');
  }

  // -------------------------------------------------------------------------
  // Step 4: Filter out evaluators who have reached their max_sheets cap
  // -------------------------------------------------------------------------
  const evaluatorsAtCapacity = [];
  const availableEvaluators = [];

  for (const evaluator of evaluatorsWithCapacity) {
    const currentCount = evaluator.capacity?.current_count ?? 0;
    const maxSheets = evaluator.capacity?.max_sheets ?? 0;

    if (currentCount >= maxSheets) {
      evaluatorsAtCapacity.push(evaluator.name);
    } else {
      availableEvaluators.push({
        id: evaluator.id,
        name: evaluator.name,
        currentCount,
        maxSheets,
        remainingCapacity: maxSheets - currentCount,
      });
    }
  }

  if (availableEvaluators.length === 0) {
    throw new Error(
      'No evaluators available — all evaluators have reached their maximum capacity.'
    );
  }

  // Sort evaluators by ID for deterministic round-robin order across runs
  availableEvaluators.sort((a, b) => a.id.localeCompare(b.id));

  // -------------------------------------------------------------------------
  // Step 5: Round-robin iterate through sorted sheets, assign to next available evaluator
  //
  // KEY FIX: Start round-robin from the evaluator with the FEWEST current
  // assignments so that even single-sheet batches are distributed fairly.
  // This prevents the index-0 bias where repeated single-sheet runs always
  // assign to the first evaluator.
  // -------------------------------------------------------------------------
  const assignments = []; // { sheetId, evaluatorId }
  const skippedSheets = [];
  const assignmentCounts = new Map(); // evaluatorId → count assigned in this run

  // Initialize assignment counts
  for (const ev of availableEvaluators) {
    assignmentCounts.set(ev.id, 0);
  }

  // Find the starting index: the first evaluator with the minimum current_count
  // This ensures fair distribution even when sheets are assigned one at a time
  const minCount = Math.min(...availableEvaluators.map(e => e.currentCount));
  let evaluatorIndex = availableEvaluators.findIndex(e => e.currentCount === minCount);

  // Debug log for assignment planning
  console.log('[AssignEngine] Available evaluators (sorted by ID):');
  for (const ev of availableEvaluators) {
    console.log(`  ${ev.name} (${ev.id}): ${ev.currentCount}/${ev.maxSheets} sheets`);
  }
  console.log(`[AssignEngine] Starting round-robin at index ${evaluatorIndex} (${availableEvaluators[evaluatorIndex].name})`);
  console.log(`[AssignEngine] Sheets to assign: ${unassignedSheets.length}`);

  for (const sheet of unassignedSheets) {
    let assigned = false;
    let attempts = 0;

    // Try each evaluator in round-robin order; skip if they've hit capacity
    while (attempts < availableEvaluators.length) {
      const evaluator = availableEvaluators[evaluatorIndex % availableEvaluators.length];
      const alreadyAssigned = assignmentCounts.get(evaluator.id) || 0;

      if (evaluator.currentCount + alreadyAssigned < evaluator.maxSheets) {
        assignments.push({
          sheetId: sheet.id,
          evaluatorId: evaluator.id,
        });
        assignmentCounts.set(evaluator.id, alreadyAssigned + 1);
        assigned = true;
        // Move to next evaluator for the next sheet (round-robin)
        evaluatorIndex = (evaluatorIndex + 1) % availableEvaluators.length;
        break;
      }

      // This evaluator is now full — try the next one
      evaluatorIndex = (evaluatorIndex + 1) % availableEvaluators.length;
      attempts++;
    }

    if (!assigned) {
      skippedSheets.push(sheet.id);
    }
  }

  // Log assignment plan before committing
  console.log('[AssignEngine] Assignment plan:');
  for (const a of assignments) {
    const name = availableEvaluators.find(e => e.id === a.evaluatorId)?.name;
    console.log(`  Sheet ${a.sheetId} → ${name}`);
  }

  const distributionSummary = {};
  for (const [evalId, count] of assignmentCounts.entries()) {
    if (count > 0) {
      const name = availableEvaluators.find(e => e.id === evalId)?.name;
      distributionSummary[name] = count;
    }
  }
  console.log('[AssignEngine] Distribution summary:', distributionSummary);

  // -------------------------------------------------------------------------
  // Step 6: Write all Assignment records + update AnswerSheet statuses +
  //         increment EvaluatorCapacity.current_count in a single DB transaction
  // -------------------------------------------------------------------------
  if (assignments.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Create all assignment records
      for (const { sheetId, evaluatorId } of assignments) {
        await tx.assignment.create({
          data: {
            sheet_id: sheetId,
            evaluator_id: evaluatorId,
          },
        });

        // Update sheet status to 'assigned'
        await tx.answerSheet.update({
          where: { id: sheetId },
          data: { status: 'assigned' },
        });
      }

      // Increment current_count for each evaluator who received sheets
      for (const [evaluatorId, count] of assignmentCounts.entries()) {
        if (count > 0) {
          await tx.evaluatorCapacity.update({
            where: { evaluator_id: evaluatorId },
            data: {
              current_count: { increment: count },
            },
          });
        }
      }
    });
  }

  // Also capture evaluators who became full during this run
  for (const ev of availableEvaluators) {
    const assigned = assignmentCounts.get(ev.id) || 0;
    if (ev.currentCount + assigned >= ev.maxSheets && !evaluatorsAtCapacity.includes(ev.name)) {
      evaluatorsAtCapacity.push(ev.name);
    }
  }

  return {
    assigned: assignments.length,
    skipped: skippedSheets.length,
    evaluatorsAtCapacity,
  };
}

module.exports = { runAssignment };
