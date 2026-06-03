// File: src/routes/assign.js
// Purpose: Assignment route — POST /api/assign triggers the fair distribution engine.
//          Protected: coordinator role only.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');
const { runAssignment } = require('../engine/assignmentEngine');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// POST /api/assign
// Coordinator only — triggers the assignment engine
// ---------------------------------------------------------------------------
router.post(
  '/',
  verifyToken,
  requireRole('coordinator'),
  async (req, res, next) => {
    try {
      const result = await runAssignment(prisma);

      return res.status(200).json({
        message: `Successfully assigned ${result.assigned} sheet(s).`,
        assigned: result.assigned,
        skipped: result.skipped,
        evaluatorsAtCapacity: result.evaluatorsAtCapacity,
      });
    } catch (err) {
      // Handle known business-logic errors with a 400 status
      if (
        err.message.includes('No unassigned sheets') ||
        err.message.includes('No evaluators available')
      ) {
        return res.status(400).json({
          error: err.message,
          code: 'ASSIGNMENT_ERROR',
        });
      }
      next(err);
    }
  }
);

module.exports = router;
