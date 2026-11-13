import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', { id:text('id').primaryKey(),space:text('space').notNull(),kind:text('kind').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull() },t=>[index('records_space_kind').on(t.space,t.kind)]);
export const accounts = sqliteTable('accounts', {id:text('id').primaryKey(),space:text('space').notNull().default('live'),name:text('name').notNull(),email:text('email').notNull(),phone:text('phone').notNull().default(''),role:text('role').notNull().default('field'),requestedRole:text('requested_role').notNull().default('field'),status:text('status').notNull().default('Pending approval'),centerId:text('center_id').notNull().default(''),passwordHash:text('password_hash'),verifiedAt:text('verified_at'),consentAt:text('consent_at'),otpHash:text('otp_hash'),otpExpires:integer('otp_expires'),otpAttempts:integer('otp_attempts').notNull().default(0),otpSentAt:integer('otp_sent_at'),createdAt:text('created_at').notNull()},t=>[uniqueIndex('accounts_space_email').on(t.space,t.email)]);
export const sessions = sqliteTable('sessions',{id:text('id').primaryKey(),accountId:text('account_id').notNull(),expires:integer('expires').notNull()});
export const attempts = sqliteTable('auth_attempts',{key:text('key').primaryKey(),count:integer('count').notNull().default(0),resetAt:integer('reset_at').notNull()});
export const activity = sqliteTable('activity',{id:text('id').primaryKey(),space:text('space').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()},t=>[index('activity_space_date').on(t.space,t.createdAt)]);

export const settings = sqliteTable('app_settings',{key:text('key').primaryKey(),value:text('value').notNull()});

export const recordWrites = sqliteTable('record_writes', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  space: text('space').notNull(),
  kind: text('kind').notNull(),
  recordId: text('record_id').notNull(),
  requestHash: text('request_hash').notNull(),
  savedAt: text('saved_at').notNull(),
});

export const starlinkDishes = sqliteTable('starlink_dishes', {
  accountId: text('account_id').primaryKey(),
  name: text('name').notNull(),
  terminalId: text('terminal_id').notNull(),
});

export const reportSequences = sqliteTable('report_sequences', {
  space: text('space').notNull(),
  eventId: text('event_id').notNull(),
  lastNumber: integer('last_number').notNull(),
}, t => [uniqueIndex('report_sequences_space_event').on(t.space, t.eventId)]);
