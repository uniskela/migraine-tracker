CREATE TABLE `backup_records` (
	`id` text PRIMARY KEY NOT NULL,
	`completedAt` text NOT NULL,
	`filename` text NOT NULL,
	`sha256` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_context` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`date` text NOT NULL,
	`factors` text NOT NULL,
	`activities` text NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_user_date` ON `daily_context` (`userId`,`date`);--> statement-breakpoint
CREATE TABLE `medication_doses` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`medicationId` text NOT NULL,
	`episodeId` text,
	`dose` real NOT NULL,
	`units` text NOT NULL,
	`takenAt` text NOT NULL,
	`effectiveness` text,
	`reviewAfterMinutes` integer NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medicationId`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episodeId`) REFERENCES `migraine_episodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doses_user_time` ON `medication_doses` (`userId`,`takenAt`);--> statement-breakpoint
CREATE TABLE `medication_side_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`medicationId` text NOT NULL,
	`name` text NOT NULL,
	`severity` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medicationId`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episode_factors` (
	`episodeId` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`episodeId`, `name`),
	FOREIGN KEY (`episodeId`) REFERENCES `migraine_episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`name`) REFERENCES `associated_factors`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `episode_symptoms` (
	`episodeId` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`episodeId`, `name`),
	FOREIGN KEY (`episodeId`) REFERENCES `migraine_episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`name`) REFERENCES `symptoms`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `migraine_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`startedAt` text NOT NULL,
	`endedAt` text,
	`severity` integer,
	`side` text NOT NULL,
	`locations` text NOT NULL,
	`characters` text NOT NULL,
	`activities` text NOT NULL,
	`notes` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `episodes_user_start` ON `migraine_episodes` (`userId`,`startedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_episode` ON `migraine_episodes` (`userId`) WHERE "migraine_episodes"."endedAt" is null;--> statement-breakpoint
CREATE TABLE `associated_factors` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `functional_impacts` (
	`episodeId` text PRIMARY KEY NOT NULL,
	`score` integer,
	`disruptions` text NOT NULL,
	FOREIGN KEY (`episodeId`) REFERENCES `migraine_episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`lockedUntil` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`dose` real,
	`units` text NOT NULL,
	`frequency` text NOT NULL,
	`startDate` text,
	`endDate` text,
	`active` integer NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oidc_states` (
	`state` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `medication_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`medicationId` text NOT NULL,
	`startDate` text,
	`endDate` text,
	`dose` real,
	`units` text NOT NULL,
	`frequency` text NOT NULL,
	FOREIGN KEY (`medicationId`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`csrf` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`userId` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sleep_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`episodeId` text,
	`day` text,
	`bedtime` text,
	`wakeTime` text,
	`hours` real,
	`quality` integer,
	`unusual` integer NOT NULL,
	`wokeDuringNight` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episodeId`) REFERENCES `migraine_episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_entries_episodeId_unique` ON `sleep_entries` (`episodeId`);--> statement-breakpoint
CREATE TABLE `symptoms` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`passwordHash` text,
	`oidcSubject` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidcSubject_unique` ON `users` (`oidcSubject`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`units` text NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
