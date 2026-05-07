import type { Response } from "express";
import type { ZodError as ZodErrorV3 } from "zod";
import type { ZodError as ZodErrorV4 } from "zod/v4";

interface ValidationErrorField {
  path: string;
  message: string;
}

export function sendValidationError(
  res: Response,
  zodError: ZodErrorV3<unknown> | ZodErrorV4,
  message = "Validation failed",
): void {
  const fields: ValidationErrorField[] = zodError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  res.status(400).json({
    error: "VALIDATION_ERROR",
    message,
    fields,
  });
}

export function sendParamError(res: Response, message: string): void {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    message,
    fields: [],
  });
}
