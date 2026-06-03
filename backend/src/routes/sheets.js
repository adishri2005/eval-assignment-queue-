// File: src/routes/sheets.js
// Purpose: GET /api/sheets — returns all answer sheets with optional status filtering.
//          Includes evaluator name and assignment info via Prisma relation include.
//          Protected: coordinator role only.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Valid status values from the SheetStatus enum
const VALID_STATUSES = ['unassigned', 'assigned', 'in_progress', 'submitted'];

// ---------------------------------------------------------------------------
// GET /api/sheets?status=<status>
// Coordinator only — returns all answer sheets, optionally filtered by status.
// Each sheet includes assignment + evaluator name if assigned.
// ---------------------------------------------------------------------------
router.get(
  '/',
  verifyToken,
  requireRole('coordinator'),
  async (req, res, next) => {
    try {
      const { status } = req.query;

      // Validate status parameter if provided
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: 'VALIDATION_ERROR',
        });
      }

      // Build the where clause
      const where = status ? { status } : {};

      // Fetch sheets with optional assignment + evaluator data
      const sheets = await prisma.answerSheet.findMany({
        where,
        include: {
          assignment: {
            include: {
              evaluator: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: [{ due_date: 'asc' }, { uploaded_at: 'asc' }],
      });

      // Transform to a flat response shape
      const result = sheets.map((sheet) => ({
        id: sheet.id,
        filename: sheet.filename,
        pdfUrl: sheet.pdf_url,
        dueDate: sheet.due_date,
        status: sheet.status,
        uploadedAt: sheet.uploaded_at,
        assignedTo: sheet.assignment?.evaluator?.name || null,
        assignedAt: sheet.assignment?.assigned_at || null,
      }));

      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
