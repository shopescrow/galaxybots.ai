import { useGetJournalEntries } from "@workspace/api-client-react";

export function useJournal(date?: string) {
  return useGetJournalEntries({ date });
}
