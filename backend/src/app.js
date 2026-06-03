// File: src/app.js
// Purpose: Express application setup — mounts all middleware (helmet, cors, json,
//          multer for PDF uploads), registers all route modules, and defines
//          the global error handler.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireRole } = require('./middleware/auth');

// Route modules
const authRoutes = require('./routes/auth');
const assignRoutes = require('./routes/assign');
const queueRoutes = require('./routes/queue');
const sheetRoutes = require('./routes/sheet');
const dashboardRoutes = require('./routes/dashboard');
const sheetsRoutes = require('./routes/sheets');

const app = express();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet());

// CORS — configurable via CORS_ORIGIN env variable
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// JSON body parser
app.use(express.json());

// ---------------------------------------------------------------------------
// File Upload (Multer) Configuration
// ---------------------------------------------------------------------------

const uploadDir = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'pdf-' + uniqueSuffix + '.pdf');
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB max
  }
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// PDF Upload Route
// Coordinator only — uploads a PDF and creates an AnswerSheet record
// ---------------------------------------------------------------------------
app.post(
  '/api/upload',
  verifyToken,
  requireRole('coordinator'),
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No PDF file uploaded.',
          code: 'UPLOAD_MISSING_FILE',
        });
      }

      // Parse optional due_date from form body; default to 7 days from now
      let dueDate;
      if (req.body.due_date) {
        dueDate = new Date(req.body.due_date);
        if (isNaN(dueDate.getTime())) {
          return res.status(400).json({
            error: 'Invalid due_date format. Use ISO 8601 (e.g., 2026-06-10T00:00:00Z).',
            code: 'VALIDATION_ERROR',
          });
        }
      } else {
        dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }

      // Build the URL path for the PDF
      const pdfUrl = `/uploads/${req.file.filename}`;

      // Create the AnswerSheet record
      const sheet = await prisma.answerSheet.create({
        data: {
          filename: req.file.originalname,
          pdf_url: pdfUrl,
          due_date: dueDate,
          status: 'unassigned',
        },
      });

      return res.status(201).json({
        message: 'Answer sheet uploaded successfully.',
        sheet: {
          id: sheet.id,
          filename: sheet.filename,
          pdfUrl: sheet.pdf_url,
          dueDate: sheet.due_date,
          status: sheet.status,
          uploadedAt: sheet.uploaded_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---------------------------------------------------------------------------
// Route Mounts
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/assign', assignRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/sheet', sheetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sheets', sheetsRoutes);

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found.`,
    code: 'NOT_FOUND',
  });
});

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  // Handle Multer errors (file size, file type)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: `Upload error: ${err.message}`,
      code: 'UPLOAD_ERROR',
    });
  }

  // Handle Multer file-filter errors
  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({
      error: err.message,
      code: 'UPLOAD_INVALID_TYPE',
    });
  }

  // Log unexpected errors
  console.error('[ERROR]', err.stack || err.message);

  res.status(err.statusCode || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message,
    code: 'INTERNAL_ERROR',
  });
});

module.exports = app;
