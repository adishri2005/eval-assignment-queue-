// File: src/routes/queue.js
// Purpose: Evaluator queue route — GET /api/queue/:evaluatorId returns the
//          evaluator's personal assignment queue. Protected: evaluator role only,
//          with strict ownership enforcement (no cross-evaluator access).

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// GET /api/queue/:evaluatorId
// Evaluator only — returns the authenticated evaluator's queue
// ---------------------------------------------------------------------------
router.get(
  '/:evaluatorId',
  verifyToken,
  requireRole('evaluator'),
  async (req, res, next) => {
    try {
      const { evaluatorId } = req.params;

      // Enforce ownership — evaluator can only view their own queue
      if (req.user.evaluatorId !== evaluatorId) {
        return res.status(403).json({
          error: 'You can only access your own queue.',
          code: 'AUTH_FORBIDDEN',
        });
      }

      // Fetch assignments with joined answer sheet data
      // Exclude sheets that have already been submitted
      const assignments = await prisma.assignment.findMany({
        where: {
          evaluator_id: evaluatorId,
          sheet: {
            status: { not: 'submitted' },
          },
        },
        include: {
          sheet: true,
        },
        orderBy: {
          sheet: {
            due_date: 'asc',
          },
        },
      });

      // Map to the expected response shape
      const queue = assignments.map((a) => ({
        assignmentId: a.id,
        sheetId: a.sheet_id,
        filename: a.sheet.filename,
        pdfUrl: a.sheet.pdf_url,
        dueDate: a.sheet.due_date,
        status: a.sheet.status,
        assignedAt: a.assigned_at,
        startedAt: a.started_at,
      }));

      return res.status(200).json(queue);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
