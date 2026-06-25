import { createContext, useContext } from 'react';

// True only in the live iframe/preview experience. The headless export path
// renders <VideoTemplate /> with the default (false), keeping the recorded
// video free of interactive chrome (links, hover reveals, info icons).
export const InteractiveContext = createContext<boolean>(false);

export function useInteractive(): boolean {
  return useContext(InteractiveContext);
}
