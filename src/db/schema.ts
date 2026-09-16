import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const systemSettings = sqliteTable('system_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

export const leads = sqliteTable('leads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  instagramHandle: text('instagram_handle').notNull().unique(),
  sourcePostUrl: text('source_post_url'),
  fullName: text('full_name'),
  bio: text('bio'),
  funnelType: text('funnel_type').notNull(),
  pipelineStatus: text('pipeline_status').notNull().default('discovered'),
  channelStatus: text('channel_status').notNull().default('browser_contact_pending'),
  followupStep: integer('followup_step').notNull().default(0),
  score: integer('score').default(0),
  fitReason: text('fit_reason'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
  // Converted tracking
  converted: integer('converted').notNull().default(0), // boolean flag (0 = false, 1 = true)
  conversionQuantity: integer('conversion_quantity').notNull().default(0) // quantity of conversions (for both funils)
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leadId: integer('lead_id').references(() => leads.id),
  channel: text('channel').notNull(),
  direction: text('direction').notNull(),
  content: text('content').notNull(),
  variant: text('variant'),
  sentAt: text('sent_at').default('CURRENT_TIMESTAMP')
});

export const aiCalls = sqliteTable('ai_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leadId: integer('lead_id').references(() => leads.id),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  estimatedCostUsd: real('estimated_cost_usd').notNull(),
  calledAt: text('called_at').default('CURRENT_TIMESTAMP')
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  errorMessage: text('error_message'),
  runAt: text('run_at').default('CURRENT_TIMESTAMP'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const waCampaigns = sqliteTable('wa_campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status').notNull().default('draft'), // draft, active, paused, cancelled, completed
  startHour: text('start_hour'),
  endHour: text('end_hour'),
  minContacts: integer('min_contacts'),
  maxContacts: integer('max_contacts'),
  daysOfWeek: text('days_of_week'), // JSON string e.g. ["Seg","Ter"]
  humanizationProfile: text('humanization_profile'), // JSON string e.g. {"natural":60,"moderated":30,"slow":10}
  aiTemplate: text('ai_template'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

export const waContacts = sqliteTable('wa_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').references(() => waCampaigns.id),
  phone: text('phone').notNull(),
  name: text('name'),
  variablesJson: text('variables_json'),
  status: text('status').notNull().default('pending'), // pending, sent, failed
  failReason: text('fail_reason'),
  sentAt: text('sent_at'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});
