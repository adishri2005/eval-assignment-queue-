// File: src/routes/dashboard.js
// Purpose: Dashboard stats route — GET /api/dashboard/stats returns aggregated
//          evaluation statistics per evaluator. Protected: coordinator role only.
//          Uses a single efficient query to avoid N+1.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// GET /api/dashboard/stats
// Coordinator only — returns per-evaluator completion statistics
// ---------------------------------------------------------------------------
router.get(
  '/stats',
  verifyToken,
  requireRole('coordinator'),
  async (req, res, next) => {
    try {
      // Fetch all evaluators with their assignments and related sheet statuses
      // in a single query — no N+1 problem
      const evaluators = await prisma.evaluator.findMany({
        where: { is_active: true },
        include: {
          assignments: {
            include: {
              sheet: {
                select: { status: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Aggregate stats per evaluator
      const stats = evaluators.map((evaluator) => {
        const total = evaluator.assignments.length;

        let completed = 0;
        let inProgress = 0;
        let pending = 0;

        for (const assignment of evaluator.assignments) {
          switch (assignment.sheet.status) {
            case 'submitted':
              completed++;
              break;
            case 'in_progress':
              inProgress++;
              break;
            case 'assigned':
              pending++;
              break;
            default:
              break;
          }
        }

        const completionPct =
          total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          evaluatorId: evaluator.id,
          name: evaluator.name,
          total,
          completed,
          inProgress,
          pending,
          completionPct,
        };
      });

      return res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
