export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred";
}

export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(toErrorMessage(err));
}
