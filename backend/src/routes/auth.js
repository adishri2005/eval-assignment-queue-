// File: src/routes/auth.js
// Purpose: Authentication route — POST /login with Zod validation, bcrypt password
//          comparison, and JWT token issuance.

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Zod schema for login request body
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Public — no auth required
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    // Validate request body with Zod
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
    }

    const { email, password } = parseResult.data;

    // Query user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        evaluator: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    // Compare password with stored hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    // Build JWT payload
    const tokenPayload = {
      userId: user.id,
      role: user.role,
    };

    // If the user is an evaluator, include evaluatorId in the token
    if (user.role === 'evaluator' && user.evaluator) {
      tokenPayload.evaluatorId = user.evaluator.id;
    }

    // Sign JWT — expires in 24 hours
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });

    return res.status(200).json({
      token,
      role: user.role,
      userId: user.id,
      evaluatorId: user.evaluator?.id || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
