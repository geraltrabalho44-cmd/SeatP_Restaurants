import { useEffect, useRef } from "react";

// The browser's Back button follows the booking steps. Each step the diner reaches (and each held table) is one history
// entry, so Back goes one step back, to the time, then to the date, and only after that to the page they came from.
// The steps live in the page's state; this hook only keeps the browser's history in line with them.

interface Entry {
  step: number;
  held: boolean;
}
interface Marker {
  flow: { index: number };
}

const markerOf = (state: unknown): Marker["flow"] | null => {
  const flow = state && typeof state === "object" ? (state as Partial<Marker>).flow : undefined;
  return flow && typeof flow.index === "number" ? flow : null;
};

/**
 * `step` and `held` are where the booking is. `finished` is true once the booking is confirmed (Back then leaves the page,
 * it never goes back into a booking that is over). `restore` puts the page where a history entry says, after Back or Forward.
 */
export function useStepHistory(step: number, held: boolean, finished: boolean, restore: (step: number, held: boolean) => void): void {
  const stack = useRef<Entry[]>([{ step, held }]);
  const index = useRef(0);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const finishedRef = useRef(finished);
  finishedRef.current = finished;

  useEffect(() => {
    // The entry the diner arrived on is the first step: remember it, keeping whatever the router stored there.
    try {
      window.history.replaceState({ ...(window.history.state as object | null), flow: { index: 0 } }, "");
    } catch {
      // History blocked: the booking still works, only Back is the browser's own.
    }
    const onPop = (event: PopStateEvent): void => {
      const flow = markerOf(event.state);
      if (!flow) return;
      if (finishedRef.current) {
        // The booking is over: Back must not reopen its steps, and one press must be enough. Skip over all of them,
        // to the page the diner came from (the entries of this page are the steps, from 0 to the one just left).
        window.history.go(-(flow.index + 1));
        return;
      }
      index.current = Math.min(flow.index, stack.current.length - 1);
      const entry = stack.current[index.current];
      if (entry) restoreRef.current(entry.step, entry.held);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (finished) return;
    const now = stack.current[index.current];
    if (now && now.step === step && now.held === held) return; // nothing new (or the page was just put there by Back)
    try {
      const backwards = now !== undefined && (step < now.step || (step === now.step && now.held && !held));
      if (backwards) {
        // A button on the page went back: do it in the browser's history too, so the entries stay in line.
        let target = index.current - 1;
        while (target >= 0 && !(stack.current[target]!.step === step && stack.current[target]!.held === held)) target -= 1;
        if (target >= 0) {
          const distance = target - index.current;
          index.current = target;
          window.history.go(distance);
          return;
        }
        stack.current[index.current] = { step, held };
        return;
      }
      stack.current = stack.current.slice(0, index.current + 1);
      stack.current.push({ step, held });
      index.current += 1;
      window.history.pushState({ flow: { index: index.current } }, "");
    } catch {
      stack.current[index.current] = { step, held };
    }
  }, [step, held, finished]);
}
