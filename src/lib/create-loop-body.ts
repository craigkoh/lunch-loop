import { z } from "zod";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

export const createLoopBodySchema = z.object({
  // The first-loop form posts token even when the page has no invitation.
  // A blank value means there is no invitation, so it must not be checked
  // against the 20-character minimum used for a real invitation token.
  token: z.preprocess(
    blankToUndefined,
    z.string().trim().min(20, "That invitation link is incomplete.").max(128, "That invitation link is incomplete.").optional(),
  ),
  groupName: z.string().trim().min(1, "Give your Lunch Loop a name.").max(80, "That Lunch Loop name is too long."),
  displayName: z.string().trim().min(1, "Add your name.").max(50, "That name is too long."),
  homeLabel: z.string().trim().min(2, "Choose a city or area.").max(160, "That city or area name is too long."),
  homeLat: z.number().min(-90, "Choose a city or area.").max(90, "Choose a city or area."),
  homeLng: z.number().min(-180, "Choose a city or area.").max(180, "Choose a city or area."),
  radiusMiles: z.number().int("Choose a search distance from 1 to 35 miles.").min(1, "Choose a search distance from 1 to 35 miles.").max(35, "Choose a search distance from 1 to 35 miles."),
  timeZone: z.string().trim().min(1, "Choose a city or area so Lunch Loop knows the time zone.").max(100, "Choose a city or area so Lunch Loop knows the time zone."),
  loopType: z.enum(["standing", "occasion"], { error: "Choose a standing loop or an occasion." }).default("standing"),
});
