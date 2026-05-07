import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface FieldDef {
  name: string;
  label: string;
  type: string;
  required: boolean;
  enumValues?: string[];
}
interface EntityDef {
  fields: FieldDef[];
}

interface Props {
  entity: EntityDef;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function RecordEditor({ entity, value, onChange }: Props) {
  const setField = (name: string, v: unknown) => onChange({ ...value, [name]: v });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {entity.fields.map((f) => {
        const cur = value[f.name];
        const id = `field-${f.name}`;
        const isWide = f.type === "text";

        return (
          <div key={f.name} className={isWide ? "md:col-span-2" : ""}>
            <Label htmlFor={id} className="flex items-center gap-1">
              {f.label}
              {f.required && <span className="text-destructive">*</span>}
              <span className="text-xs text-muted-foreground font-mono ml-1">{f.type}</span>
            </Label>

            {f.type === "boolean" ? (
              <div className="flex items-center gap-2 h-10">
                <Checkbox
                  id={id}
                  checked={!!cur}
                  onCheckedChange={(v) => setField(f.name, !!v)}
                />
                <span className="text-sm text-muted-foreground">{cur ? "true" : "false"}</span>
              </div>
            ) : f.type === "enum" && f.enumValues && f.enumValues.length > 0 ? (
              <Select value={cur != null ? String(cur) : ""} onValueChange={(v) => setField(f.name, v || null)}>
                <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {f.enumValues.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.type === "text" ? (
              <Textarea
                id={id}
                value={cur != null ? String(cur) : ""}
                onChange={(e) => setField(f.name, e.target.value || null)}
                rows={3}
              />
            ) : (
              <Input
                id={id}
                type={f.type === "number" ? "number" : f.type === "date" ? "datetime-local" : "text"}
                value={cur != null ? String(cur) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") return setField(f.name, null);
                  if (f.type === "number") {
                    const n = Number(v);
                    setField(f.name, isNaN(n) ? v : n);
                  } else {
                    setField(f.name, v);
                  }
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
