CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text DEFAULT 'live' NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'field' NOT NULL,
	`requested_role` text DEFAULT 'field' NOT NULL,
	`status` text DEFAULT 'Pending approval' NOT NULL,
	`center_id` text DEFAULT '' NOT NULL,
	`password_hash` text,
	`verified_at` text,
	`consent_at` text,
	`otp_hash` text,
	`otp_expires` integer,
	`otp_attempts` integer DEFAULT 0 NOT NULL,
	`otp_sent_at` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_space_email` ON `accounts` (`space`,`email`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_space_date` ON `activity` (`space`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_space_kind` ON `records` (`space`,`kind`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL
);
