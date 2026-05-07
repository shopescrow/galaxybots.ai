import type { CrmBlueprintDef, CrmEntityDef, CrmFieldDef, CrmFieldType } from "@workspace/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const PHONE_RE = /^[+()\-\s\d]{7,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|$| )/;

function isBoolish(s: string): boolean {
  const v = s.trim().toLowerCase();
  return v === "true" || v === "false" || v === "yes" || v === "no";
}

function looksLikeNumber(s: string): boolean {
  if (s.trim() === "") return false;
  const cleaned = s.replace(/[,$%\s]/g, "");
  if (cleaned === "") return false;
  return !isNaN(Number(cleaned));
}

function looksLikeDate(s: string): boolean {
  if (ISO_DATE_RE.test(s)) return true;
  const t = Date.parse(s);
  return !isNaN(t) && s.length >= 6 && /[\/\-]/.test(s);
}

function inferFieldType(values: unknown[]): { type: CrmFieldType; enumValues?: string[] } {
  const nonNull = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (nonNull.length === 0) return { type: "string" };

  if (nonNull.every((v) => typeof v === "boolean")) return { type: "boolean" };
  if (nonNull.every((v) => typeof v === "number")) return { type: "number" };

  const strs = nonNull.map((v) => String(v));

  if (strs.every(isBoolish)) return { type: "boolean" };
  if (strs.every((s) => EMAIL_RE.test(s))) return { type: "email" };
  if (strs.every((s) => URL_RE.test(s))) return { type: "url" };
  if (strs.every((s) => PHONE_RE.test(s)) && strs.some((s) => /\d{3}/.test(s))) return { type: "phone" };
  if (strs.every(looksLikeNumber)) return { type: "number" };
  if (strs.every(looksLikeDate)) return { type: "date" };

  // Enum detection: small cardinality of distinct, short values
  const distinct = Array.from(new Set(strs));
  if (
    distinct.length <= 8 &&
    distinct.length < strs.length &&
    distinct.every((s) => s.length <= 40)
  ) {
    return { type: "enum", enumValues: distinct };
  }

  if (strs.some((s) => s.length > 120)) return { type: "text" };
  return { type: "string" };
}

function humanizeFieldName(raw: string): string {
  return raw
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugifyEntity(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "records"
  );
}

export function inferBlueprintFromRows(
  rows: Record<string, unknown>[],
  jobName: string,
  extractionType: string
): CrmBlueprintDef {
  if (rows.length === 0) {
    return { entities: [] };
  }

  // Collect all field names across rows (some rows may be missing fields)
  const fieldSet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) fieldSet.add(k);
  }
  const fieldNames = Array.from(fieldSet);

  const fields: CrmFieldDef[] = fieldNames.map((name) => {
    const allValues = rows.map((r) => r[name]);
    const presentValues = allValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    const required = presentValues.length === rows.length && rows.length > 0;
    const { type, enumValues } = inferFieldType(presentValues);
    const sampleValues = presentValues.slice(0, 3);

    return {
      name,
      label: humanizeFieldName(name),
      type,
      required,
      ...(enumValues ? { enumValues } : {}),
      sampleValues,
      sourceField: name,
    };
  });

  // Pick a primary display field: first email, then first string-y, then first field
  let primary = fields.find((f) => f.type === "email")?.name;
  if (!primary) {
    primary =
      fields.find((f) => f.type === "string" && /name|title|label/i.test(f.name))?.name ||
      fields.find((f) => f.type === "string" || f.type === "text")?.name ||
      fields[0]?.name;
  }

  const entityLabelBase =
    extractionType === "contacts"
      ? "Contacts"
      : extractionType === "table"
        ? "Records"
        : extractionType === "list"
          ? "Items"
          : humanizeFieldName(jobName);

  const entity: CrmEntityDef = {
    name: slugifyEntity(entityLabelBase),
    label: entityLabelBase,
    primaryDisplayField: primary,
    fields,
  };

  return { entities: [entity] };
}
