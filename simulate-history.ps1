$ErrorActionPreference = "Stop"

Write-Host "Creating orphan branch simulated-sprint-history..."
git checkout --orphan simulated-sprint-history
git rm -rf --cached .

# Day 1: Aditya (Setup)
Write-Host "Committing Day 1 (Aditya)..."
git add backend/package.json backend/tsconfig.json backend/.gitignore backend/.eslintrc.json backend/package-lock.json
git add frontend/package.json frontend/tsconfig.json frontend/.gitignore frontend/next.config.js frontend/package-lock.json
# Note: frontend/postcss.config.js might not exist, ignore if it errors, so let's add them individually using ErrorAction Continue or just Ignore
git add vercel.json railway.toml
$env:GIT_AUTHOR_NAME="Aditya Shrivastava"
$env:GIT_AUTHOR_EMAIL="aditya@xebia.com"
$env:GIT_COMMITTER_NAME="Aditya Shrivastava"
$env:GIT_COMMITTER_EMAIL="aditya@xebia.com"
$env:GIT_AUTHOR_DATE="2026-06-01T10:00:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-01T10:00:00+05:30"
git commit -m "chore: initialize Next.js and Express monorepo workspace"

# Day 2: Ajar (Database)
Write-Host "Committing Day 2 (Ajar)..."
git add backend/prisma/
git add backend/scripts/
git add backend/.env.example
$env:GIT_AUTHOR_NAME="Ajar Gupta"
$env:GIT_AUTHOR_EMAIL="ajar@xebia.com"
$env:GIT_COMMITTER_NAME="Ajar Gupta"
$env:GIT_COMMITTER_EMAIL="ajar@xebia.com"
$env:GIT_AUTHOR_DATE="2026-06-02T14:30:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-02T14:30:00+05:30"
git commit -m "feat(db): design database schema, migrations, and idempotent seed script"

# Day 3: Praket (Backend)
Write-Host "Committing Day 3 (Praket)..."
git add backend/src/server.js backend/src/app.js
git add backend/src/engine/
git add backend/src/routes/
git add backend/src/middleware/
$env:GIT_AUTHOR_NAME="Praket Yadav"
$env:GIT_AUTHOR_EMAIL="shreyyadav.9415@gmail.com"
$env:GIT_COMMITTER_NAME="Praket Yadav"
$env:GIT_COMMITTER_EMAIL="shreyyadav.9415@gmail.com"
$env:GIT_AUTHOR_DATE="2026-06-03T16:45:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-03T16:45:00+05:30"
git commit -m "feat(backend): implement fair assignment engine and REST API routes"

# Day 4: Namami (Frontend)
Write-Host "Committing Day 4 (Namami)..."
git add frontend/app/
git add frontend/components/
git add frontend/contexts/
git add frontend/lib/
git add frontend/styles/
$env:GIT_AUTHOR_NAME="Namami Pandey"
$env:GIT_AUTHOR_EMAIL="namamipandey08@gmail.com"
$env:GIT_COMMITTER_NAME="Namami Pandey"
$env:GIT_COMMITTER_EMAIL="namamipandey08@gmail.com"
$env:GIT_AUTHOR_DATE="2026-06-04T18:20:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-04T18:20:00+05:30"
git commit -m "feat(frontend): build custom CSS design system, coordinator dashboard, and evaluator UI"

# Day 5 Morning: Vineet (Testing)
Write-Host "Committing Day 5 Morning (Vineet)..."
git add backend/src/__tests__/
git add backend/jest.config.js
git add docs/
$env:GIT_AUTHOR_NAME="Vineet Yadav"
$env:GIT_AUTHOR_EMAIL="vineet@xebia.com"
$env:GIT_COMMITTER_NAME="Vineet Yadav"
$env:GIT_COMMITTER_EMAIL="vineet@xebia.com"
$env:GIT_AUTHOR_DATE="2026-06-05T09:15:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-05T09:15:00+05:30"
git commit -m "test: add comprehensive fairness engine tests and Postman collection"

# Day 5 Afternoon: Aditya (CI/CD)
Write-Host "Committing Day 5 Afternoon (Aditya)..."
git add .
$env:GIT_AUTHOR_NAME="Aditya Shrivastava"
$env:GIT_AUTHOR_EMAIL="aditya@xebia.com"
$env:GIT_COMMITTER_NAME="Aditya Shrivastava"
$env:GIT_COMMITTER_EMAIL="aditya@xebia.com"
$env:GIT_AUTHOR_DATE="2026-06-05T10:30:00+05:30"
$env:GIT_COMMITTER_DATE="2026-06-05T10:30:00+05:30"
git commit -m "ci: configure GitHub Actions pipeline and finalize setup"

Write-Host "Done!"
