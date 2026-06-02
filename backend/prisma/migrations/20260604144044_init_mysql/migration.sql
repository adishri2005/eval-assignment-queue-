-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('coordinator', 'evaluator') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluators` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `evaluators_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `answer_sheets` (
    `id` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `pdf_url` LONGTEXT NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `status` ENUM('unassigned', 'assigned', 'in_progress', 'submitted') NOT NULL DEFAULT 'unassigned',
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `answer_sheets_status_idx`(`status`),
    INDEX `answer_sheets_due_date_idx`(`due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignments` (
    `id` VARCHAR(191) NOT NULL,
    `sheet_id` VARCHAR(191) NOT NULL,
    `evaluator_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,

    UNIQUE INDEX `assignments_sheet_id_key`(`sheet_id`),
    INDEX `assignments_evaluator_id_idx`(`evaluator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluator_capacities` (
    `id` VARCHAR(191) NOT NULL,
    `evaluator_id` VARCHAR(191) NOT NULL,
    `max_sheets` INTEGER NOT NULL,
    `current_count` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `evaluator_capacities_evaluator_id_key`(`evaluator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `evaluators` ADD CONSTRAINT `evaluators_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_sheet_id_fkey` FOREIGN KEY (`sheet_id`) REFERENCES `answer_sheets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_evaluator_id_fkey` FOREIGN KEY (`evaluator_id`) REFERENCES `evaluators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluator_capacities` ADD CONSTRAINT `evaluator_capacities_evaluator_id_fkey` FOREIGN KEY (`evaluator_id`) REFERENCES `evaluators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
