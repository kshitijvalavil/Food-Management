import type { SymbolId } from "@/components/sprite-symbols";

// Food marks from the mockups, picked by keywords in the item name.
const RULES: Array<[RegExp, SymbolId]> = [
  [/palak|spinach|methi|fenugreek|lettuce|cabbage|greens|kale/i, "f-palak"],
  [/coriander|cilantro|dhania|mint|pudina|parsley|herb|curry leaves/i, "f-cor"],
  [/paneer|tofu|cheese/i, "f-paneer"],
  [/egg/i, "f-egg"],
  [/milk/i, "f-milk"],
  [/curd|dahi|yog(h)?urt|raita|lassi|buttermilk/i, "f-curd"],
  [/tomato|chilli|chili|capsicum|pepper|apple|pomegranate/i, "f-tom"],
  [/butter|ghee|margarine/i, "f-butter"],
  [/lemon|lime|banana|mango|orange/i, "f-lemon"],
  [/bread|pav|bun|roti|naan|loaf/i, "f-bread"],
  [/biscuit|parle|cookie|cracker|rusk/i, "f-bisc"],
  [/rice|atta|flour|dal|besan|sugar|salt|sooji|rava|poha|oats|sack|lentil|gram|nuts|cashew|almond|peas/i, "f-sack"],
];

export function foodSymbol(name: string): SymbolId | null {
  for (const [re, id] of RULES) if (re.test(name)) return id;
  return null;
}
