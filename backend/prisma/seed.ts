// File: prisma/seed.ts
// Purpose: Idempotent seed script — creates 1 coordinator, 3 evaluators,
//          3 capacity records, and 6 answer sheets for demo purposes.
//          Safe to run multiple times (uses upsert exclusively).

import { PrismaClient, Role, SheetStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  await prisma.$connect();
  console.log('🌱 Seeding database...\n');

  // ---------------------------------------------------------------------------
  // 1. Hash passwords
  // ---------------------------------------------------------------------------
  const coordPasswordHash = await bcrypt.hash('Coord@123', SALT_ROUNDS);
  const evalPasswordHash = await bcrypt.hash('Eval@123', SALT_ROUNDS);

  // ---------------------------------------------------------------------------
  // 2. Upsert Users (1 coordinator + 3 evaluators = 4 users)
  // ---------------------------------------------------------------------------
  const coordinator = await prisma.user.upsert({
    where: { email: 'coordinator@xebia.com' },
    update: {
      password_hash: coordPasswordHash,
      role: Role.coordinator,
    },
    create: {
      email: 'coordinator@xebia.com',
      password_hash: coordPasswordHash,
      role: Role.coordinator,
    },
  });

  const evaluatorData = [
    { email: 'evaluator1@xebia.com', name: 'Evaluator One' },
    { email: 'evaluator2@xebia.com', name: 'Evaluator Two' },
    { email: 'evaluator3@xebia.com', name: 'Evaluator Three' },
  ];

  const evaluatorUsers = [];
  for (const ev of evaluatorData) {
    const user = await prisma.user.upsert({
      where: { email: ev.email },
      update: {
        password_hash: evalPasswordHash,
        role: Role.evaluator,
      },
      create: {
        email: ev.email,
        password_hash: evalPasswordHash,
        role: Role.evaluator,
      },
    });
    evaluatorUsers.push({ user, name: ev.name });
  }

  console.log(`  ✓ Users seeded (${1 + evaluatorUsers.length} total)`);

  // ---------------------------------------------------------------------------
  // 3. Upsert Evaluator Profiles (linked 1:1 via user_id)
  // ---------------------------------------------------------------------------
  const evaluatorProfiles = [];
  for (const { user, name } of evaluatorUsers) {
    const evaluator = await prisma.evaluator.upsert({
      where: { user_id: user.id },
      update: {
        name: name,
        is_active: true,
      },
      create: {
        user_id: user.id,
        name: name,
        is_active: true,
      },
    });
    evaluatorProfiles.push(evaluator);
  }

  console.log(`  ✓ Evaluators seeded (${evaluatorProfiles.length} profiles)`);

  // ---------------------------------------------------------------------------
  // 4. Upsert Evaluator Capacities (max_sheets: 10, current_count: 0)
  // ---------------------------------------------------------------------------
  for (const evaluator of evaluatorProfiles) {
    await prisma.evaluatorCapacity.upsert({
      where: { evaluator_id: evaluator.id },
      update: {
        max_sheets: 10,
        current_count: 0,
      },
      create: {
        evaluator_id: evaluator.id,
        max_sheets: 10,
        current_count: 0,
      },
    });
  }

  console.log(`  ✓ Capacities seeded (${evaluatorProfiles.length} records, max_sheets: 10)`);

  // ---------------------------------------------------------------------------
  // 5. Upsert 6 Answer Sheets with dynamic due dates relative to now
  // ---------------------------------------------------------------------------
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const sheetData = [
    { id: 'seed-sheet-001', filename: 'sheet_001.pdf', dueDays: 3 },
    { id: 'seed-sheet-002', filename: 'sheet_002.pdf', dueDays: 5 },
    { id: 'seed-sheet-003', filename: 'sheet_003.pdf', dueDays: 2 },
    { id: 'seed-sheet-004', filename: 'sheet_004.pdf', dueDays: 7 },
    { id: 'seed-sheet-005', filename: 'sheet_005.pdf', dueDays: 1 },
    { id: 'seed-sheet-006', filename: 'sheet_006.pdf', dueDays: 4 },
  ];

  for (const sheet of sheetData) {
    const dueDate = new Date(now + sheet.dueDays * DAY_MS);

    await prisma.answerSheet.upsert({
      where: { id: sheet.id },
      update: {
        filename: sheet.filename,
        pdf_url: `/uploads/${sheet.filename}`,
        due_date: dueDate,
        status: SheetStatus.unassigned,
      },
      create: {
        id: sheet.id,
        filename: sheet.filename,
        pdf_url: `/uploads/${sheet.filename}`,
        due_date: dueDate,
        status: SheetStatus.unassigned,
      },
    });
  }

  console.log(`  ✓ Answer sheets seeded (${sheetData.length} sheets)`);

  console.log('\n✅ Seed complete!');
  console.log(`   ${1} coordinator, ${evaluatorUsers.length} evaluators, ${sheetData.length} answer sheets`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
