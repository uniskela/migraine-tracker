import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { Settings } from "../shared/validation.js";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  username: text().notNull().unique(),
  passwordHash: text(),
  oidcSubject: text().unique(),
  createdAt: text().notNull(),
});
export const settings = sqliteTable("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  value: text({ mode: "json" }).$type<Settings>().notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  csrf: text().notNull(),
  expiresAt: integer().notNull(),
});
export const loginAttempts = sqliteTable("login_attempts", {
  key: text().primaryKey(),
  failures: integer().notNull(),
  lockedUntil: integer().notNull(),
  updatedAt: integer().notNull(),
});
export const oidcStates = sqliteTable("oidc_states", {
  state: text().primaryKey(),
  verifier: text().notNull(),
  nonce: text().notNull(),
  expiresAt: integer().notNull(),
});
export const episodes = sqliteTable(
  "migraine_episodes",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: text().notNull(),
    endedAt: text(),
    severity: integer(),
    side: text().notNull(),
    locations: text({ mode: "json" }).$type<string[]>().notNull(),
    characters: text({ mode: "json" }).$type<string[]>().notNull(),
    activities: text({ mode: "json" }).$type<string[]>().notNull(),
    notes: text().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [
    index("episodes_user_start").on(t.userId, t.startedAt),
    uniqueIndex("one_active_episode")
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
  ],
);
export const symptoms = sqliteTable("symptoms", { name: text().primaryKey() });
export const factors = sqliteTable("associated_factors", {
  name: text().primaryKey(),
});
export const episodeSymptoms = sqliteTable(
  "episode_symptoms",
  {
    episodeId: text()
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    name: text()
      .notNull()
      .references(() => symptoms.name),
  },
  (t) => [primaryKey({ columns: [t.episodeId, t.name] })],
);
export const episodeFactors = sqliteTable(
  "episode_factors",
  {
    episodeId: text()
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    name: text()
      .notNull()
      .references(() => factors.name),
  },
  (t) => [primaryKey({ columns: [t.episodeId, t.name] })],
);
export const impacts = sqliteTable("functional_impacts", {
  episodeId: text()
    .primaryKey()
    .references(() => episodes.id, { onDelete: "cascade" }),
  score: integer(),
  disruptions: text({ mode: "json" }).$type<string[]>().notNull(),
});
export const sleep = sqliteTable("sleep_entries", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  episodeId: text()
    .unique()
    .references(() => episodes.id, { onDelete: "cascade" }),
  day: text(),
  bedtime: text(),
  wakeTime: text(),
  hours: real(),
  quality: integer(),
  unusual: integer({ mode: "boolean" }).notNull(),
  wokeDuringNight: integer({ mode: "boolean" }).notNull(),
});
export const medications = sqliteTable("medications", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  category: text().$type<"preventive" | "acute">().notNull(),
  dose: real(),
  units: text().notNull(),
  frequency: text().notNull(),
  startDate: text(),
  endDate: text(),
  active: integer({ mode: "boolean" }).notNull(),
  notes: text().notNull(),
});
export const schedules = sqliteTable("medication_schedules", {
  id: text().primaryKey(),
  medicationId: text()
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  startDate: text(),
  endDate: text(),
  dose: real(),
  units: text().notNull(),
  frequency: text().notNull(),
});
export const doses = sqliteTable(
  "medication_doses",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    medicationId: text()
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    episodeId: text().references(() => episodes.id, { onDelete: "set null" }),
    dose: real().notNull(),
    units: text().notNull(),
    takenAt: text().notNull(),
    effectiveness: text().$type<"None" | "Some" | "Good" | "Complete">(),
    reviewAfterMinutes: integer().notNull(),
    notes: text().notNull(),
  },
  (t) => [index("doses_user_time").on(t.userId, t.takenAt)],
);
export const effects = sqliteTable("medication_side_effects", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  medicationId: text()
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  name: text().notNull(),
  severity: integer().notNull(),
  date: text().notNull(),
  notes: text().notNull(),
});
export const weights = sqliteTable("weight_entries", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text().notNull(),
  value: real().notNull(),
  units: text().$type<"kg" | "lb">().notNull(),
  notes: text().notNull(),
});
export const daily = sqliteTable(
  "daily_context",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text().notNull(),
    factors: text({ mode: "json" }).$type<string[]>().notNull(),
    activities: text({ mode: "json" }).$type<string[]>().notNull(),
    notes: text().notNull(),
  },
  (t) => [uniqueIndex("daily_user_date").on(t.userId, t.date)],
);
export const backups = sqliteTable("backup_records", {
  id: text().primaryKey(),
  completedAt: text().notNull(),
  filename: text().notNull(),
  sha256: text().notNull(),
});
