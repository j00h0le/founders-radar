import { z } from "zod";
import { eventTypes } from "@/types/event";

export const industries = [
  "AI",
  "Fintech",
  "SaaS",
  "E-commerce",
  "Healthcare",
  "Education",
  "Climate Tech",
  "Robotics",
  "Other",
] as const;

export const startupStages = [
  "Idea",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Other",
] as const;

export const industrySchema = z.enum(industries);
export const startupStageSchema = z.enum(startupStages);

export const founderProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  startupName: z.string().trim().min(1, "Enter your startup name."),
  industries: z
    .array(industrySchema)
    .min(1, "Choose at least one industry."),
  stage: startupStageSchema,
  startupDescription: z
    .string()
    .trim()
    .max(8000, "Keep the startup description under 8000 characters.")
    .default(""),
  preferredLocation: z
    .string()
    .trim()
    .min(1, "Enter a preferred location."),
  preferredEventTypes: z.array(z.enum(eventTypes)).default([]),
});

export type Industry = z.infer<typeof industrySchema>;
export type StartupStage = z.infer<typeof startupStageSchema>;
export type FounderProfile = z.infer<typeof founderProfileSchema>;

export const demoProfile: FounderProfile = {
  name: "Mina Cho",
  startupName: "Harbornote",
  startupDescription: "",
  industries: ["AI", "SaaS"],
  stage: "Seed",
  preferredLocation: "Seoul",
  preferredEventTypes: [],
};
