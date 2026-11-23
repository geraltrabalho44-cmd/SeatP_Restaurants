// Step 6 of the owner's setup: review and publish (spec 5.3). A checklist where
// every item says "Done" or "To do" in words (never colour alone) with a link to
// fix it. Publish only works when every required item is done, and the server
// checks everything again: this page is a convenience, not the source of truth.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOwnerProfile, getPublishCheck, publishProblems, publishRestaurant, unpublishRestaurant } from "../../api/owner";
import type { PublishCheck, PublishProblem } from "../../api/owner";
import { Badge, Button, Dialog, ErrorState, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { checklist } from "./publishChecklist";
import { OwnerShell } from "./OwnerShell";
import { ListingPreview } from "./ListingPreview";
import { RoomsPreview } from "./RoomsPreview";
import "./owner.css";

export default function PublishReview() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getPublishCheck(venueId), venueId);
  return (
    <OwnerShell title={t("Review and publish")} venueId={venueId} venueName={state.status === "ready" ? state.data.name : undefined} current="review">
      {state.status === "loading" && <><h1 className="ow-title">{t("Review and publish")}</h1><Skeleton label={t("Checking your restaurant")} lines={5} /></>}
      {state.status === "error" && <><h1 className="ow-title">{t("Review and publish")}</h1><ErrorState message={t("Could not check your restaurant. Check your sign-in or retry.")} onRetry={() => reload()} /></>}
      {state.status === "ready" && <Review key={venueId} venueId={venueId} check={state.data} onChange={setData} refresh={() => reload(true)} />}
    </OwnerShell>
  );
}

function Review({ venueId, check, onChange, refresh }: { venueId: string; check: PublishCheck; onChange: (check: PublishCheck) => void; refresh: () => void }) {
  const { t } = useT();
  const { state: profile } = useLoad(() => getOwnerProfile(venueId), venueId);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<PublishProblem[]>([]);
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState(false);
  const published = check.status === "published";
  const rows = checklist(check.problems, check.tips);
  const blocking = rows.filter((row) => !row.done && row.required);
  const pending = rows.filter((row) => !row.done);
  const done = rows.filter((row) => row.done);
  // One word for where the restaurant stands: what the owner should do next follows from it.
  const stage = published ? t("Published") : check.ready ? t("Ready to publish") : blocking.length === 1 ? t("Draft · 1 blocker") : t("Draft · {n} blockers", { n: blocking.length });
  const preview = url ?? publicUrl(check.slug);
  const completed = <ol className="owner-checklist" aria-label={pending.length === 0 ? t("Before you publish") : t("Checks already done")}>
    {done.map((row) => <CheckRow key={row.label} row={row} />)}
  </ol>;

  const publish = async (): Promise<void> => {
    setBusy(true);
    setRefused([]);
    setProblem("");
    try {
      const answer = await publishRestaurant(venueId);
      onChange({ ...check, status: "published" });
      setUrl(answer.url);
    } catch (error) {
      const found = publishProblems(error);
      if (found.length > 0) {
        setRefused(found);
        refresh();
      } else setProblem(errorMessage(error, t("We could not publish. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  const unpublish = async (): Promise<void> => {
    setBusy(true);
    setProblem("");
    try {
      await unpublishRestaurant(venueId);
      onChange({ ...check, status: "draft" });
      setUrl(null);
      setConfirming(false);
    } catch (error) {
      setProblem(errorMessage(error, t("We could not unpublish. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ow-review">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Review and publish")}</h1>
          <p className="rb-muted">{t("See which checks are required for {name} to go live.", { name: check.name })}</p>
        </div>
        <p role="status" className="owner-stage"><Badge tone={published ? "success" : check.ready ? "info" : "warning"}>{stage}</Badge></p>
      </div>
      <div className="ow-two">
        <div className="ow-left">
        <aside className="rb-card ow-listing" aria-label={t("Public listing")}>
          <h2 className="ow-card-title">{t("Public listing")}</h2>
          <ListingPreview venueId={venueId} name={check.name} profile={profile.status === "ready" ? profile.data : undefined} />
          <RoomsPreview venueId={venueId} />
        </aside>
        <div className="ow-publish-bar" role="group" aria-label={t("Publish")}>
          <p className="rb-muted">
            {published
              ? t("{name} is live and open for bookings.", { name: check.name })
              : check.ready
                ? t("Everything required is done. Preview the restaurant, then publish it.")
                : blocking.length === 1
                  ? t("Preview the restaurant and fix the blocker to enable publishing.")
                  : t("Preview the restaurant and fix the {n} blockers to enable publishing.", { n: blocking.length })}
          </p>
          <div className="ow-publish-actions">
            {preview && <Link className={`btn btn-${published ? "primary" : "secondary"}`} to={preview}>{published ? t("View public page") : t("Preview listing")} <span aria-hidden="true">↗</span></Link>}
            {!published && (
              <Button busy={busy} disabled={!check.ready} onClick={() => void publish()}>
                {t("Publish restaurant")}
              </Button>
            )}
            {published && (
              <Button variant="ghost" busy={busy} onClick={() => setConfirming(true)}>
                {t("Unpublish")}
              </Button>
            )}
          </div>
          {refused.length > 0 && (
            <div role="alert" className="room-error">
              <p>{t("The server found problems, so nothing was published:")}</p>
              <ul>
                {refused.map((p) => (
                  <li key={`${p.code}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            </div>
          )}
          {problem && (
            <p role="alert" className="room-error">
              {problem}
            </p>
          )}
          {!check.ready && !published && <p className="rb-muted">{t("Publish switches on when every item marked To do is done.")}</p>}
          {published && <p className="rb-muted">{t("Unpublishing hides {name} from search and stops new bookings. Bookings already made stay.", { name: check.name })}</p>}
        </div>
        </div>
        <div className="rb-card ow-checks">
          {pending.length > 0 && (
            <>
              <h2 className="ow-card-title">{blocking.length > 0 ? (blocking.length === 1 ? t("1 thing to fix") : t("{n} things to fix", { n: blocking.length })) : t("Recommended")}</h2>
              <ol className="owner-checklist" aria-label={t("Before you publish")}>
                {pending.map((row) => <CheckRow key={row.label} row={row} />)}
              </ol>
            </>
          )}
          {/* What is already right stays visible, but below what still needs doing. */}
          {done.length > 0 && (pending.length === 0 ? (
            <details className="ow-completed-disclosure">
              <summary>{t("Completed checks")} <Badge tone="success">{t("{n} complete", { n: done.length })}</Badge></summary>
              {completed}
            </details>
          ) : (
            <section className="owner-done" aria-label={t("Completed checks")}>
              <h2 className="ow-card-title ow-card-title-small">{t("Completed checks")} <Badge tone="success">{t("{n} complete", { n: done.length })}</Badge></h2>
              {completed}
            </section>
          ))}
        </div>
      </div>
      <Dialog
        open={confirming}
        title={t("Remove from search?")}
        onClose={() => setConfirming(false)}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>{t("Keep it published")}</Button>
          <Button variant="danger" busy={busy} onClick={() => void unpublish()}>{t("Unpublish")}</Button>
        </>}
      >
        <p>{t("{name} will disappear from search and stop taking new bookings. Bookings already made stay, and you can publish again at any time.", { name: check.name })}</p>
      </Dialog>
    </section>
  );
}

function CheckRow({ row }: { row: ReturnType<typeof checklist>[number] }) {
  const { t } = useT();
  return (
    <li className={row.done ? "owner-check-done" : "owner-check-todo"}>
      <span aria-hidden="true" className="owner-check-mark">
        {row.done ? "✓" : "!"}
      </span>
      <div>
        <strong>{row.label}</strong> <span className="owner-check-word">{row.done ? t("Done") : row.required ? t("To do") : t("Recommended")}</span>
        {row.messages.map((message) => (
          <p key={message} className="rb-muted">
            {message}
          </p>
        ))}
      </div>
      {!row.done && row.fix && <Link className="btn btn-secondary ow-fix" to={row.fix}>{row.fixLabel} <span aria-hidden="true">→</span></Link>}
    </li>
  );
}

function publicUrl(slug: string | null): string | null {
  return slug ? `/restaurants/${encodeURIComponent(slug)}` : null;
}
