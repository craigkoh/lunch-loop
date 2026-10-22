import { ZodError, type ZodIssue } from "zod";

const rawZodMessage = /^(Too small:|Too big:|Invalid input|Invalid option|Invalid string|Invalid number|Invalid email|Invalid UUID|Unrecognized key|Invalid key|Invalid value|Invalid discriminator)/;

const fieldCopy: Record<string, { small?: string; big?: string; invalid?: string }> = {
  token: { invalid: "That invitation link is incomplete." },
  code: { invalid: "Enter an invitation link or code.", big: "That invitation code is too long." },
  groupName: { small: "Give your Lunch Loop a name.", big: "That Lunch Loop name is too long.", invalid: "Give your Lunch Loop a name." },
  displayName: { small: "Add your name.", big: "That name is too long.", invalid: "Add your name." },
  homeLabel: { small: "Choose a city or area.", big: "That city or area name is too long.", invalid: "Choose a city or area." },
  homeLat: { invalid: "Choose a city or area." },
  homeLng: { invalid: "Choose a city or area." },
  radiusMiles: { invalid: "Choose a search distance from 1 to 35 miles." },
  timeZone: { small: "Choose a city or area so Lunch Loop knows the time zone.", big: "Choose a city or area so Lunch Loop knows the time zone.", invalid: "Choose a city or area so Lunch Loop knows the time zone." },
  loopType: { invalid: "Choose a standing loop or an occasion." },
  kind: { invalid: "Choose what kind of note this is." },
  title: { small: "Add a short title.", big: "That title is too long.", invalid: "Add a short title." },
  details: { small: "Add a few more details.", big: "Those details are too long.", invalid: "Add a few more details." },
  pagePath: { invalid: "That page could not be saved with this note.", big: "That page could not be saved with this note." },
  build: { invalid: "That build could not be saved with this note.", big: "That build could not be saved with this note." },
  creditName: { big: "Credit names can be up to 60 characters.", invalid: "Credit names can be up to 60 characters." },
  creditOptIn: { invalid: "Check the credit box again." },
  groupId: { invalid: "Choose a Lunch Loop." },
  userId: { invalid: "Choose a friend to add." },
  email: { invalid: "Enter a valid email address.", big: "Enter a valid email address." },
  label: { big: "That label is too long.", invalid: "That label is too long." },
  query: { small: "Enter a search of two to 120 characters.", big: "Enter a search of two to 120 characters.", invalid: "Enter a search of two to 120 characters." },
};

function copyFor(issue: ZodIssue) {
  const field = [...issue.path].reverse().find((part) => typeof part === "string");
  if (typeof field !== "string") return undefined;
  const copy = fieldCopy[field];
  if (!copy) return undefined;
  if (issue.code === "too_big") return copy.big ?? copy.invalid;
  if (issue.code === "too_small") return copy.small ?? copy.invalid;
  return copy.invalid ?? copy.small ?? copy.big;
}

/** Plain sentence for the first Zod issue. Custom schema messages pass through. */
export function validationErrorMessage(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Check what you entered and try again.";
  if (issue.message && !rawZodMessage.test(issue.message)) return issue.message;
  return copyFor(issue) ?? "Check what you entered and try again.";
}
