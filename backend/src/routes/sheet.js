// File: src/routes/sheet.js
// Purpose: Sheet status route — PATCH /api/sheet/:id/status allows evaluators to
//          transition a sheet to 'in_progress' or 'submitted'. Protected: evaluator
//          role only, with ownership enforcement.

const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Zod schema for status update
// ---------------------------------------------------------------------------
const statusUpdateSchema = z.object({
  status: z.enum(['in_progress', 'submitted'], {
    errorMap: () => ({
      message: "Status must be either 'in_progress' or 'submitted'.",
    }),
  }),
});

// ---------------------------------------------------------------------------
// PATCH /api/sheet/:id/status
// Evaluator only — update sheet status with ownership check
// ---------------------------------------------------------------------------
router.patch(
  '/:id/status',
  verifyToken,
  requireRole('evaluator'),
  async (req, res, next) => {
    try {
      const { id: sheetId } = req.params;

      // Validate request body
      const parseResult = statusUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.flatten().fieldErrors;
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
        });
      }

      const { status: newStatus } = parseResult.data;

      // Find the assignment for this sheet
      const assignment = await prisma.assignment.findUnique({
        where: { sheet_id: sheetId },
        include: { sheet: true },
      });

      if (!assignment) {
        return res.status(404).json({
          error: 'Answer sheet not found or not assigned.',
          code: 'SHEET_NOT_FOUND',
        });
      }

      // Enforce ownership — the sheet must belong to this evaluator
      if (assignment.evaluator_id !== req.user.evaluatorId) {
        return res.status(403).json({
          error: 'You can only update your own assigned sheets.',
          code: 'AUTH_FORBIDDEN',
        });
      }

      // Validate status transitions
      const currentStatus = assignment.sheet.status;

      if (newStatus === 'in_progress' && currentStatus !== 'assigned') {
        return res.status(400).json({
          error: `Cannot start a sheet with status '${currentStatus}'. Only 'assigned' sheets can be started.`,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      if (newStatus === 'submitted' && currentStatus !== 'in_progress') {
        return res.status(400).json({
          error: `Cannot submit a sheet with status '${currentStatus}'. Only 'in_progress' sheets can be submitted.`,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      // Perform the update within a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update the answer sheet status
        const updatedSheet = await tx.answerSheet.update({
          where: { id: sheetId },
          data: { status: newStatus },
        });

        // Update the assignment timestamps
        const assignmentUpdate = {};
        if (newStatus === 'in_progress') {
          assignmentUpdate.started_at = new Date();
        } else if (newStatus === 'submitted') {
          assignmentUpdate.submitted_at = new Date();
        }

        const updatedAssignment = await tx.assignment.update({
          where: { id: assignment.id },
          data: assignmentUpdate,
        });

        // Decrement evaluator's current_count when a sheet is submitted
        if (newStatus === 'submitted') {
          await tx.evaluatorCapacity.update({
            where: { evaluator_id: assignment.evaluator_id },
            data: {
              current_count: { decrement: 1 },
            },
          });
        }

        return { sheet: updatedSheet, assignment: updatedAssignment };
      });

      return res.status(200).json({
        message: `Sheet status updated to '${newStatus}'.`,
        sheetId: result.sheet.id,
        status: result.sheet.status,
        startedAt: result.assignment.started_at,
        submittedAt: result.assignment.submitted_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
