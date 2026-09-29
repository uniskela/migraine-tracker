import { z } from "zod";
import { DateTime, IANAZone } from "luxon";
const note = z.string().trim().max(5000).default("");
const selections = z
  .array(z.string().trim().min(1).max(80))
  .max(40)
  .transform((v) => [...new Set(v)])
  .default([]);
export const instant = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Invalid date");
export const timezone = z
  .string()
  .refine((v) => IANAZone.isValidZone(v), "Use a valid IANA timezone");
export const sleepSchema = z
  .object({
    bedtime: instant.nullable().default(null),
    wakeTime: instant.nullable().default(null),
    hours: z.number().min(0).max(24).nullable().default(null),
    quality: z.number().int().min(1).max(5).nullable().default(null),
    unusual: z.boolean().default(false),
    wokeDuringNight: z.boolean().default(false),
  })
  .refine(
    (v) => !v.bedtime || !v.wakeTime || v.wakeTime >= v.bedtime,
    "Wake time must follow bedtime",
  );
export const episodeSchema = z
  .object({
    startedAt: instant,
    endedAt: instant.nullable().default(null),
    severity: z.number().int().min(1).max(10).nullable().default(null),
    side: z
      .enum(["Left", "Right", "Both", "Unspecified"])
      .default("Unspecified"),
    locations: selections,
    characters: selections,
    symptoms: selections,
    factors: selections,
    activities: selections,
    disruptions: selections,
    impact: z.number().int().min(0).max(5).nullable().default(null),
    sleep: sleepSchema.nullable().default(null),
    notes: note,
  })
  .refine(
    (v) => !v.endedAt || v.endedAt >= v.startedAt,
    "End time must follow start time",
  )
  .refine(
    (v) => new Date(v.startedAt).getTime() <= Date.now() + 60000,
    "Start time cannot be in the future",
  )
  .refine(
    (v) => !v.endedAt || new Date(v.endedAt).getTime() <= Date.now() + 60000,
    "End time cannot be in the future",
  );
export type EpisodeInput = z.infer<typeof episodeSchema>;
export type Episode = EpisodeInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const medicationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.enum(["preventive", "acute"]),
    dose: z.number().positive().max(100000).nullable().default(null),
    units: z.string().trim().max(30).default("mg"),
    frequency: z.string().trim().max(120).default(""),
    startDate: date.nullable().default(null),
    endDate: date.nullable().default(null),
    active: z.boolean().default(true),
    notes: note,
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    "End date must follow start date",
  );
export type Medication = z.infer<typeof medicationSchema> & { id: string };
export const doseSchema = z
  .object({
    medicationId: z.uuid(),
    episodeId: z.uuid().nullable().default(null),
    dose: z.number().positive().max(100000),
    units: z.string().trim().min(1).max(30),
    takenAt: instant,
    effectiveness: z
      .enum(["None", "Some", "Good", "Complete"])
      .nullable()
      .default(null),
    reviewAfterMinutes: z.number().int().min(15).max(1440).default(120),
    notes: note,
  })
  .refine(
    (v) => new Date(v.takenAt).getTime() <= Date.now() + 60000,
    "Dose time cannot be in the future",
  );
export type Dose = z.infer<typeof doseSchema> & { id: string };
export const effectSchema = z.object({
  medicationId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  severity: z.number().int().min(1).max(5),
  date,
  notes: note,
});
export const weightSchema = z.object({
  date,
  value: z.number().positive().max(2000),
  units: z.enum(["kg", "lb"]),
  notes: note,
});
export const dailySchema = z.object({
  date,
  factors: selections,
  activities: selections,
  sleep: sleepSchema.nullable().default(null),
  notes: note,
});
export const settingsSchema = z.object({
  timezone,
  dateFormat: z
    .enum(["d MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy"])
    .default("d MMM yyyy"),
  timeFormat: z.enum(["12", "24"]).default("12"),
  units: z.enum(["kg", "lb"]).default("kg"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  lowStimulation: z.boolean().default(false),
  weightEnabled: z.boolean().default(false),
  defaultSide: z
    .enum(["Left", "Right", "Both", "Unspecified"])
    .default("Unspecified"),
  defaultSymptoms: selections,
  defaultCharacters: selections,
});
export type Settings = z.infer<typeof settingsSchema>;
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9@._+-]+$/, "Use an email or letters, digits, . _ + -");
export const password = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128);
export const setupSchema = z.object({
  username,
  password,
  setupSecret: z.string().min(1).max(512),
  timezone,
  units: z.enum(["kg", "lb"]).default("kg"),
});
export const loginSchema = z.object({
  username,
  password: z.string().min(1).max(128),
});
export const periodSchema = z
  .object({ from: date, to: date })
  .refine(
    (v) =>
      v.to >= v.from &&
      DateTime.fromISO(v.to).diff(DateTime.fromISO(v.from), "days").days <=
        3660,
    "Choose a period of up to ten years",
  );
