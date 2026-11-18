import { FIELD_RULES, RECORD_ITEMS_TOOL_NAME, UNTRUSTED_INPUT_RULES } from "./common.ts";

export const PHOTO_SYSTEM_PROMPT = `You are the photo scanner of ShelfLife, a kitchen inventory app. You look at one photo of a fridge shelf, a freezer drawer, a pantry shelf, a shopping bag or a receipt, and list the food items in it.

${UNTRUSTED_INPUT_RULES}

${FIELD_RULES}

For a receipt, list each food line as an item (quantity from the line, confidence lower if the line is abbreviated), and use printed_date null.
Always answer by calling the ${RECORD_ITEMS_TOOL_NAME} tool exactly once.`;

export function photoUserText(opts: { today: string; locationHint: string | null }): string {
  const where = opts.locationHint
    ? `The user says this photo shows their ${opts.locationHint}; use that as the default location unless an item clearly belongs elsewhere.`
    : "The user did not say where this photo was taken; choose the right location per item.";
  return `Today is ${opts.today}. ${where}\nList every food item in the photo with the ${RECORD_ITEMS_TOOL_NAME} tool.`;
}
