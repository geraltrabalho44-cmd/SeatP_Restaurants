// Route /owner/sign-in/callback: where Google or Apple send the owner back. The one-time token comes after
// the "#" of the address (so it never reaches a server log); this page checks that the sign-in was started
// in this tab (the nonce), takes the token out of the address bar, and hands it to SeatPlan to check.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { finishSocialSignIn, readSocialReturn } from "../../api/identity";
import type { SecondStep } from "../../api/identity";
import { ApiError } from "../../api/client";
import { PageShell, Skeleton } from "../../design/components";
import { SecondStepForm } from "./SecondStepForm";
import "../login.css";

export default function SocialCallbackPage() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const [second, setSecond] = useState<SecondStep | null>(null);
  // Read once: React may run the effect twice in development, and the nonce can be used only once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const found = readSocialReturn(window.location.hash, window.location.search);
    window.history.replaceState(null, "", window.location.pathname);
    if ("problem" in found) {
      setProblem(found.problem);
      return;
    }
    finishSocialSignIn(found.token).then(
      (result) => {
        if ("second" in result) setSecond(result.second);
        else navigate("/owner", { replace: true });
      },
      (error) => setProblem(error instanceof ApiError ? error.message : "Something went wrong. Please try again."),
    );
  }, [navigate]);

  return (
    <PageShell title="Signing you in">
      <div className="login">
        {second ? (
          <>
            <h1>One more step</h1>
            <SecondStepForm step={second} onDone={() => navigate("/owner", { replace: true })} onCancel={() => navigate("/owner/sign-in", { replace: true })} />
          </>
        ) : problem ? (
          <>
            <h1>We could not sign you in</h1>
            <p role="alert">{problem}</p>
            <p>
              <Link to="/owner/sign-in">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Signing you in</h1>
            <Skeleton lines={2} label="Signing you in" />
          </>
        )}
      </div>
    </PageShell>
  );
}
