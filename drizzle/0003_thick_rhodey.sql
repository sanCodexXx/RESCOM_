CREATE TABLE `record_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`space` text NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `starlink_dishes` (
	`account_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`terminal_id` text NOT NULL
);
