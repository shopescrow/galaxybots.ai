import type { CrmFieldDef } from "@workspace/db";

export type TransformId =
  | "trim"
  | "collapse_whitespace"
  | "lowercase"
  | "uppercase"
  | "title_case"
  | "lowercase_email"
  | "e164_phone"
  | "iso_date"
  | "strip_currency"
  | "to_number"
  | "to_boolean"
  | "strip_html"
  | "null_if_empty";

export interface TransformResult {
  value: unknown;
  warnings: { code: string; message: string }[];
}

const PHONE_DIGITS_RE = /\d/g;

function trim(v: unknown): unknown {
  return typeof v === "string" ? v.trim() : v;
}

function collapseWhitespace(v: unknown): unknown {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v;
}

function lowercase(v: unknown): unknown {
  return typeof v === "string" ? v.toLowerCase() : v;
}

function uppercase(v: unknown): unknown {
  return typeof v === "string" ? v.toUpperCase() : v;
}

function titleCase(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (_m, c: string, rest: string) => c.toUpperCase() + rest);
}

function lowercaseEmail(v: unknown): TransformResult {
  if (typeof v !== "string") return { value: v, warnings: [] };
  const cleaned = v.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
  return {
    value: cleaned,
    warnings: ok ? [] : [{ code: "email_malformed", message: `"${cleaned}" does not look like a valid email` }],
  };
}

function stripHtml(v: unknown): unknown {
  return typeof v === "string" ? v.replace(/<[^>]*>/g, "") : v;
}

function nullIfEmpty(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

/**
 * Best-effort E.164 phone formatting. If a country code prefix is missing and
 * the digit count looks like a US/CA 10-digit number, default to +1.
 * If we can't confidently format, return the cleaned digits with a warning.
 */
function e164Phone(v: unknown, defaultCountry = "1"): TransformResult {
  if (v === null || v === undefined || v === "") return { value: null, warnings: [] };
  const s = String(v).trim();
  const hasPlus = s.startsWith("+");
  const digits = (s.match(PHONE_DIGITS_RE) ?? []).join("");
  if (!digits) {
    return { value: s, warnings: [{ code: "phone_unparseable", message: `"${s}" has no digits` }] };
  }
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { value: `+${digits}`, warnings: [] };
  }
  if (digits.length === 10) {
    return { value: `+${defaultCountry}${digits}`, warnings: [] };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { value: `+${digits}`, warnings: [] };
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return { value: `+${digits}`, warnings: [{ code: "phone_assumed_country", message: "phone formatted without country code prefix" }] };
  }
  return { value: s, warnings: [{ code: "phone_unparseable", message: `"${s}" not a recognizable phone number` }] };
}

function isoDate(v: unknown): TransformResult {
  if (v === null || v === undefined || v === "") return { value: null, warnings: [] };
  const s = String(v).trim();
  const t = Date.parse(s);
  if (isNaN(t)) {
    return { value: s, warnings: [{ code: "date_unparseable", message: `"${s}" is not a recognizable date` }] };
  }
  // Date-only if no time component visible
  const hasTime = /\d{1,2}:\d{2}/.test(s);
  const d = new Date(t);
  return { value: hasTime ? d.toISOString() : d.toISOString().slice(0, 10), warnings: [] };
}

function stripCurrency(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v.replace(/[$£€¥₹,]/g, "").trim();
}

function toNumber(v: unknown): TransformResult {
  if (v === null || v === undefined || v === "") return { value: null, warnings: [] };
  if (typeof v === "number") return { value: v, warnings: [] };
  const cleaned = String(v).replace(/[$£€¥₹,\s%]/g, "");
  if (cleaned === "") return { value: null, warnings: [] };
  const n = Number(cleaned);
  if (isNaN(n)) {
    return { value: v, warnings: [{ code: "number_unparseable", message: `"${v}" is not a number` }] };
  }
  return { value: n, warnings: [] };
}

function toBoolean(v: unknown): TransformResult {
  if (typeof v === "boolean") return { value: v, warnings: [] };
  if (v === null || v === undefined || v === "") return { value: null, warnings: [] };
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "1", "y", "t"].includes(s)) return { value: true, warnings: [] };
  if (["false", "no", "0", "n", "f"].includes(s)) return { value: false, warnings: [] };
  return { value: v, warnings: [{ code: "boolean_unparseable", message: `"${v}" is not a boolean` }] };
}

export interface TransformDescriptor {
  id: TransformId;
  label: string;
  description: string;
  appliesTo: string[]; // CrmFieldType[]
}

export const TRANSFORM_LIBRARY: TransformDescriptor[] = [
  { id: "trim", label: "Trim whitespace", description: "Remove leading/trailing whitespace", appliesTo: ["string", "text", "email", "url", "phone"] },
  { id: "collapse_whitespace", label: "Collapse whitespace", description: "Collapse runs of whitespace into a single space", appliesTo: ["string", "text"] },
  { id: "lowercase", label: "Lowercase", description: "Convert to lowercase", appliesTo: ["string", "text", "email"] },
  { id: "uppercase", label: "Uppercase", description: "Convert to UPPERCASE", appliesTo: ["string", "text"] },
  { id: "title_case", label: "Title Case", description: "Capitalize Each Word", appliesTo: ["string"] },
  { id: "lowercase_email", label: "Normalize email", description: "Trim + lowercase + validate", appliesTo: ["email"] },
  { id: "e164_phone", label: "Format phone (E.164)", description: "Reformat to +<country><number>", appliesTo: ["phone"] },
  { id: "iso_date", label: "Parse to ISO date", description: "Parse and normalize to ISO 8601", appliesTo: ["date"] },
  { id: "strip_currency", label: "Strip currency symbols", description: "Remove $, £, €, ¥, ₹ and commas", appliesTo: ["number", "string"] },
  { id: "to_number", label: "Coerce to number", description: "Parse to number, strip currency/percent symbols", appliesTo: ["number"] },
  { id: "to_boolean", label: "Coerce to boolean", description: "Map yes/no/true/false to boolean", appliesTo: ["boolean"] },
  { id: "strip_html", label: "Strip HTML", description: "Remove HTML tags", appliesTo: ["string", "text"] },
  { id: "null_if_empty", label: "Null if empty", description: "Convert empty strings to null", appliesTo: ["string", "text", "email", "url", "phone"] },
];

export function defaultTransformsForType(type: CrmFieldDef["type"]): TransformId[] {
  switch (type) {
    case "email":
      return ["null_if_empty", "lowercase_email"];
    case "phone":
      return ["null_if_empty", "e164_phone"];
    case "date":
      return ["null_if_empty", "iso_date"];
    case "number":
      return ["null_if_empty", "strip_currency", "to_number"];
    case "boolean":
      return ["to_boolean"];
    case "url":
      return ["null_if_empty", "trim"];
    case "text":
      return ["trim", "strip_html", "null_if_empty"];
    case "string":
      return ["trim", "collapse_whitespace", "null_if_empty"];
    case "enum":
      return ["trim", "null_if_empty"];
    default:
      return ["trim", "null_if_empty"];
  }
}

export function applyTransform(id: TransformId, value: unknown): TransformResult {
  switch (id) {
    case "trim": return { value: trim(value), warnings: [] };
    case "collapse_whitespace": return { value: collapseWhitespace(value), warnings: [] };
    case "lowercase": return { value: lowercase(value), warnings: [] };
    case "uppercase": return { value: uppercase(value), warnings: [] };
    case "title_case": return { value: titleCase(value), warnings: [] };
    case "lowercase_email": return lowercaseEmail(value);
    case "e164_phone": return e164Phone(value);
    case "iso_date": return isoDate(value);
    case "strip_currency": return { value: stripCurrency(value), warnings: [] };
    case "to_number": return toNumber(value);
    case "to_boolean": return toBoolean(value);
    case "strip_html": return { value: stripHtml(value), warnings: [] };
    case "null_if_empty": return { value: nullIfEmpty(value), warnings: [] };
    default: return { value, warnings: [] };
  }
}

export function applyTransformChain(ids: TransformId[], value: unknown): TransformResult {
  let cur = value;
  const allWarnings: { code: string; message: string }[] = [];
  for (const id of ids) {
    const r = applyTransform(id, cur);
    cur = r.value;
    if (r.warnings.length > 0) allWarnings.push(...r.warnings);
  }
  return { value: cur, warnings: allWarnings };
}
