import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import DiscoverPage from "./DiscoverPage";

// The last logo click already acted on, so that Back to an older home entry brings back what the diner had chosen.
let handled = 0;

/** The home page. A click on the SeatPlan logo (it sends `state.fresh`) opens it as on arriving: nothing chosen. */
export default function DiscoverRoute() {
  const location = useLocation();
  const fresh = (location.state as { fresh?: number } | null)?.fresh ?? 0;
  const isFresh = fresh !== 0 && fresh !== handled;
  useEffect(() => {
    if (fresh) handled = fresh;
  }, [fresh]);
  return <DiscoverPage key={fresh || "home"} fresh={isFresh} />;
}
