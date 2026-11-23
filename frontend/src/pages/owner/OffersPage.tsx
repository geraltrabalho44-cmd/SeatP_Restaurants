// The owner's Offers page: discount coupons for guests. The restaurant bears the cost (nothing is paid
// through SeatPlan). An offer is given one of three ways: a shared code and link, sent by the owner to
// chosen guests, or automatically by a rule. Only guests who said yes to offers are ever emailed.
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { changeOffer, createOffer, listOffers, previewReach, sendOffer, toggleOffer } from "../../api/offers";
import type { Audience, OfferInput, OfferKind, OfferView, Reach, RuleType, Segment, SendResult } from "../../api/offers";
import { Badge, Button, Checkbox, ErrorState, Field, Select, Skeleton, useToast } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { QrImage, downloadQr } from "../../qr/QrImage";
import { CopyLink } from "../restaurant/CopyLink";
import { errorMessage, formatDate } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import { euroCents } from "./menuPrice";
import { OFFER_TEMPLATES } from "./offerTemplates";
import "./owner.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const AUDIENCE_NAME: Record<Audience, Message> = { link: "Shared code and link", send: "Sent by you", auto: "Automatic" };
export const SEGMENT_NAME: Record<Segment, Message> = {
  all: "Everyone who accepts offers",
  lapsed: "Haven't been in for 60 days",
  regular: "Regulars (3 or more visits)",
  new: "New guests (one booking)",
  no_shows: "Guests who missed 2 or more bookings",
  list: "Guests I choose (emails)",
};

interface Draft {
  name: string;
  kind: OfferKind;
  amount: string;
  gift: string;
  audience: Audience;
  rule: RuleType;
  days: string;
  visits: string;
  note: string;
  starts: string;
  ends: string;
  maxUses: string;
  minParty: string;
  weekdays: number[];
}

const BLANK: Draft = { name: "", kind: "percent", amount: "10", gift: "", audience: "link", rule: "winback", days: "60", visits: "5", note: "", starts: "", ends: "", maxUses: "", minParty: "1", weekdays: [] };

function draftOf(offer: OfferView): Draft {
  const rule = offer.rule ?? {};
  return {
    name: offer.name,
    kind: offer.kind,
    amount: offer.kind === "amount" ? String(offer.value / 100) : String(offer.value || ""),
    gift: offer.gift_text,
    audience: offer.audience,
    rule: rule.type ?? "winback",
    days: String(rule.days ?? 60),
    visits: String(rule.visits ?? 5),
    note: offer.note,
    starts: offer.starts_on ?? "",
    ends: offer.ends_on ?? "",
    maxUses: offer.max_uses === null ? "" : String(offer.max_uses),
    minParty: String(offer.min_party),
    weekdays: offer.weekdays,
  };
}

/** Why the form cannot be saved, in the owner's words; null when it can. Also builds what is sent. */
export function toInput(draft: Draft): { input: OfferInput } | { problem: string } {
  if (!draft.name.trim()) return { problem: tr("Give the offer a name guests will recognise.") };
  let value = 0;
  if (draft.kind === "percent") {
    value = Number(draft.amount);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { problem: tr("A percentage is a whole number from 1 to 100.") };
  } else if (draft.kind === "amount") {
    const cents = euroCents(draft.amount);
    if (cents === null || cents < 100 || cents > 100_000) return { problem: tr("An amount off is between €1 and €1000.") };
    value = cents;
  } else if (!draft.gift.trim()) {
    return { problem: tr("Say what the free item is, for example dessert.") };
  }
  let rule: OfferInput["rule"] = null;
  if (draft.audience === "auto") {
    if (draft.rule === "winback") {
      const days = Number(draft.days);
      if (!Number.isInteger(days) || days < 14 || days > 365) return { problem: tr("Win-back is for guests who have not been in for 14 to 365 days.") };
      rule = { type: "winback", days };
    } else if (draft.rule === "nth_visit") {
      const visits = Number(draft.visits);
      if (!Number.isInteger(visits) || visits < 2 || visits > 50) return { problem: tr("Choose a visit number from 2 to 50.") };
      rule = { type: "nth_visit", visits };
    } else {
      rule = { type: "welcome" };
    }
  }
  if (draft.starts && draft.ends && draft.ends < draft.starts) return { problem: tr("The offer cannot end before it starts.") };
  const maxUses = draft.maxUses.trim() === "" ? null : Number(draft.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return { problem: tr("The number of uses is a whole number, or empty for no limit.") };
  const minParty = Number(draft.minParty);
  if (!Number.isInteger(minParty) || minParty < 1 || minParty > 50) return { problem: tr("The smallest party is a whole number from 1 to 50.") };
  return {
    input: {
      name: draft.name.trim(),
      kind: draft.kind,
      value,
      gift_text: draft.kind === "gift" ? draft.gift.trim() : "",
      audience: draft.audience,
      rule,
      note: draft.note.trim(),
      starts_on: draft.starts || null,
      ends_on: draft.ends || null,
      max_uses: maxUses,
      min_party: minParty,
      weekdays: draft.weekdays,
    },
  };
}

export default function OffersPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload, setData } = useLoad(() => listOffers(venueId), venueId);
  const [creating, setCreating] = useState(false);
  // From the guest list: "Send an offer to this group" arrives with ?send=lapsed and so on.
  const [params] = useSearchParams();
  const wanted = params.get("send");
  const firstSegment: Segment = wanted !== null && wanted in SEGMENT_NAME ? (wanted as Segment) : "lapsed";
  return (
    <OwnerShell title={t("Offers")} venueId={venueId} current="offers">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Offers")}</h1>
          <p className="rb-muted">{t("Discount coupons to bring guests back. You bear the cost: SeatPlan only tells your staff what to take off the bill. Offers are emailed only to guests who said yes to offers.")}</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={creating}>
          {t("New offer")}
        </Button>
      </div>
      {state.status === "loading" && <Skeleton label={t("Loading your offers")} lines={4} />}
      {state.status === "error" && <ErrorState message={t("Could not open your offers. Check your sign-in or retry.")} onRetry={() => reload()} />}
      {state.status === "ready" && (
        <>
          {creating && (
            <OfferForm
              venueId={venueId}
              onDone={(offer) => {
                setCreating(false);
                if (offer) setData({ ...state.data, offers: [offer, ...state.data.offers] });
              }}
            />
          )}
          {!creating && <ReadyMade venueId={venueId} taken={state.data.offers.map((offer) => offer.name)} onMade={(offer) => setData({ ...state.data, offers: [offer, ...state.data.offers] })} />}
          {state.data.offers.length === 0 && !creating && <p className="rb-muted">{t("No offers yet. Pick one of the ready-made offers above, or make your own with New offer.")}</p>}
          {state.data.offers.length > 0 && <h2 className="ow-subtitle ow-offers-title">{t("Your offers")}</h2>}
          {state.data.offers.map((offer) => (
            <OfferCard key={offer.id} venueId={venueId} offer={offer} limits={state.data} firstSegment={firstSegment} onChanged={(next) => setData({ ...state.data, offers: state.data.offers.map((o) => (o.id === next.id ? next : o)) })} />
          ))}
        </>
      )}
    </OwnerShell>
  );
}

/** Offers that are ready to use: one tap makes the offer, and it can be changed afterwards like any other. */
function ReadyMade({ venueId, taken, onMade }: { venueId: string; taken: string[]; onMade: (offer: OfferView) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const left = OFFER_TEMPLATES.filter((template) => !taken.includes(tr(template.name as Message)));
  if (left.length === 0) return null;
  const use = async (id: string): Promise<void> => {
    const template = OFFER_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    setBusy(id);
    try {
      onMade(await createOffer(venueId, { ...template.input, name: tr(template.name as Message), gift_text: template.input.gift_text ? tr(template.input.gift_text as Message) : "", note: template.input.note ? tr(template.input.note as Message) : "" }));
      toast.show(t("Offer made."), "success");
    } catch (error) {
      toast.show(errorMessage(error, t("We could not save the offer. Please try again.")), "danger");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="ow-ready" aria-label={t("Ready-made offers")}>
      <h2 className="ow-subtitle">{t("Ready-made offers")}</h2>
      <p className="rb-muted">{t("Pick one to start with. You can change anything about it afterwards.")}</p>
      <div className="ow-ready-grid">
        {left.map((template) => (
          <article key={template.id} className="owner-card ow-ready-card">
            <div className="owner-card-body">
              <h3>{t(template.name as Message)}</h3>
              <p className="rb-muted">{t(template.about as Message)}</p>
              <Button variant="secondary" busy={busy === template.id} disabled={busy !== null && busy !== template.id} onClick={() => void use(template.id)}>{t("Use this offer")}</Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function OfferForm({ venueId, existing, onDone }: { venueId: string; existing?: OfferView; onDone: (offer: OfferView | null) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(existing ? draftOf(existing) : BLANK);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<Draft>): void => setDraft({ ...draft, ...patch });
  const save = async (): Promise<void> => {
    const built = toInput(draft);
    if ("problem" in built) {
      setProblem(built.problem);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const saved = existing ? await changeOffer(venueId, existing.id, built.input) : await createOffer(venueId, built.input);
      toast.show(existing ? t("Offer saved.") : t("Offer made."), "success");
      onDone(saved);
    } catch (error) {
      setProblem(errorMessage(error, t("We could not save the offer. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="owner-card" aria-label={existing ? t("Edit offer") : t("New offer")}>
      <div className="owner-card-body">
        <h2 className="ow-subtitle">{existing ? t("Edit offer") : t("New offer")}</h2>
        <Field label={t("Name guests will see")} value={draft.name} maxLength={80} placeholder={t("e.g. We miss you")} onChange={(event) => set({ name: event.target.value })} />
        <Select label={t("What the guest gets")} value={draft.kind} options={[{ value: "percent", label: t("A percentage off the bill") }, { value: "amount", label: t("An amount off the bill") }, { value: "gift", label: t("A free item") }]} onChange={(event) => set({ kind: event.target.value as OfferKind })} />
        {draft.kind === "gift" ? (
          <Field label={t("The free item")} value={draft.gift} maxLength={80} placeholder={t("e.g. dessert")} onChange={(event) => set({ gift: event.target.value })} />
        ) : (
          <Field label={draft.kind === "percent" ? t("Percentage off (1 to 100)") : t("Amount off (€)")} inputMode="decimal" value={draft.amount} onChange={(event) => set({ amount: event.target.value })} />
        )}
        <Select
          label={t("How guests get it")}
          value={draft.audience}
          disabled={existing !== undefined}
          hint={existing ? t("To give it a different way, make a new offer.") : undefined}
          options={[
            { value: "link", label: t("A shared code and link you hand out") },
            { value: "send", label: t("You send it to guests you choose") },
            { value: "auto", label: t("Automatically, by a rule") },
          ]}
          onChange={(event) => set({ audience: event.target.value as Audience })}
        />
        {draft.audience === "auto" && (
          <>
            <Select
              label={t("When it is given")}
              value={draft.rule}
              options={[
                { value: "winback", label: t("To guests who have not been in for a while") },
                { value: "welcome", label: t("As a thank-you after a guest's first visit") },
                { value: "nth_visit", label: t("As a reward on a guest's Nth visit") },
              ]}
              onChange={(event) => set({ rule: event.target.value as RuleType })}
            />
            {draft.rule === "winback" && <Field label={t("Not been in for (days)")} inputMode="numeric" value={draft.days} onChange={(event) => set({ days: event.target.value })} />}
            {draft.rule === "nth_visit" && <Field label={t("On visit number")} inputMode="numeric" value={draft.visits} onChange={(event) => set({ visits: event.target.value })} />}
          </>
        )}
        <Field label={t("A line from you (optional)")} hint={t("Shown in the email, for example: Come and try the new menu.")} value={draft.note} maxLength={300} onChange={(event) => set({ note: event.target.value })} />
        <Field label={t("Valid from (optional)")} type="date" value={draft.starts} onChange={(event) => set({ starts: event.target.value })} />
        <Field label={t("Valid until (optional)")} type="date" value={draft.ends} onChange={(event) => set({ ends: event.target.value })} />
        <Field label={t("Most times it can be used (optional)")} hint={t("Each guest can use it once.")} inputMode="numeric" value={draft.maxUses} onChange={(event) => set({ maxUses: event.target.value })} />
        <Field label={t("Smallest party")} inputMode="numeric" value={draft.minParty} onChange={(event) => set({ minParty: event.target.value })} />
        <fieldset className="ow-days">
          <legend>{t("Valid on bookings for (none ticked means every day)")}</legend>
          {WEEKDAYS.map((name, index) => (
            <Checkbox key={name} label={t(name)} checked={draft.weekdays.includes(index)} onChange={(event) => set({ weekdays: event.target.checked ? [...draft.weekdays, index].sort() : draft.weekdays.filter((day) => day !== index) })} />
          ))}
        </fieldset>
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
        <div className="rb-actions">
          <Button busy={busy} onClick={() => void save()}>
            {existing ? t("Save offer") : t("Make offer")}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => onDone(null)}>
            {t("Cancel")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ruleText(offer: OfferView): string {
  const rule = offer.rule ?? {};
  if (rule.type === "winback") return tr("Given to guests who have not been in for {n} days.", { n: rule.days ?? "" });
  if (rule.type === "welcome") return tr("Given as a thank-you after a guest's first visit.");
  if (rule.type === "nth_visit") return tr("Given on a guest's visit number {n}.", { n: rule.visits ?? "" });
  return "";
}

function OfferCard({ venueId, offer, limits, firstSegment, onChanged }: { venueId: string; offer: OfferView; limits: { daily_cap: number; guest_cooldown_days: number }; firstSegment: Segment; onChanged: (offer: OfferView) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (editing) {
    return (
      <OfferForm
        venueId={venueId}
        existing={offer}
        onDone={(saved) => {
          setEditing(false);
          if (saved) onChanged(saved);
        }}
      />
    );
  }
  const archive = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await toggleOffer(venueId, offer.id);
      onChanged(next);
      toast.show(next.active ? t("Offer restored.") : t("Offer archived. It can no longer be used."), "success");
    } catch (error) {
      toast.show(errorMessage(error, t("We could not change the offer.")), "danger");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="owner-card" aria-label={t("Offer: {name}", { name: offer.name })}>
      <div className="owner-card-body">
        <h2 className="ow-subtitle">
          {offer.name} <Badge tone={offer.active ? "success" : "neutral"}>{offer.active ? t("Active") : t("Archived")}</Badge> <Badge>{t(AUDIENCE_NAME[offer.audience])}</Badge>
        </h2>
        <p>
          <strong>{offer.what}</strong>
          {offer.min_party > 1 ? `, ${t("for parties of {n} or more", { n: offer.min_party })}` : ""}
          {offer.weekdays.length > 0 ? `, ${t("on {days}", { days: offer.weekdays.map((d) => t(WEEKDAYS[d])).join(", ") })}` : ""}
          {offer.ends_on ? `, ${t("until {date}", { date: formatDate(offer.ends_on) })}` : ""}.
        </p>
        {offer.audience === "auto" && <p className="rb-muted">{ruleText(offer)}</p>}
        <p className="rb-muted" data-testid="offer-stats">
          {t("Used {n}", { n: offer.uses })}
          {offer.max_uses !== null ? ` ${t("of {n}", { n: offer.max_uses })}` : ""} {offer.uses === 1 ? t("time") : t("times")}
          {offer.audience !== "link" ? ` · ${offer.codes_issued === 1 ? t("1 code given") : t("{n} codes given", { n: offer.codes_issued })}` : ""}
        </p>
        {offer.link && <CopyLink url={offer.link} label={t("Link with code {code}", { code: offer.code ?? "" })} shared />}
        {offer.link && <QrBlock link={offer.link} name={offer.name} code={offer.code ?? "offer"} />}
        {offer.audience === "send" && offer.active && <SendPanel venueId={venueId} offer={offer} limits={limits} first={firstSegment} onSent={() => onChanged(offer)} />}
        <div className="rb-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
            {t("Edit")}
          </Button>
          <Button variant="ghost" busy={busy} onClick={() => void archive()}>
            {offer.active ? t("Archive") : t("Restore")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SendPanel({ venueId, offer, limits, first, onSent }: { venueId: string; offer: OfferView; limits: { daily_cap: number; guest_cooldown_days: number }; first: Segment; onSent: () => void }) {
  const { t } = useT();
  const [segment, setSegment] = useState<Segment>(first);
  const [list, setList] = useState("");
  const [reach, setReach] = useState<Reach | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const emails = list.split(/[\s,;]+/).filter(Boolean);
  const run = async (action: "preview" | "send"): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      if (action === "preview") {
        setReach(await previewReach(venueId, segment, emails));
        setResult(null);
      } else {
        setResult(await sendOffer(venueId, offer.id, segment, emails));
        setReach(null);
        onSent();
      }
    } catch (error) {
      setProblem(errorMessage(error, t("We could not do that. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ow-send" role="group" aria-label={t("Send {name}", { name: offer.name })}>
      <Select label={t("Send this offer to")} value={segment} options={(Object.keys(SEGMENT_NAME) as Segment[]).map((key) => ({ value: key, label: t(SEGMENT_NAME[key]) }))} onChange={(event) => { setSegment(event.target.value as Segment); setReach(null); setResult(null); }} />
      {segment === "list" && (
        <div>
          <label htmlFor={`ow-list-${offer.id}`}>{t("Email addresses, one per line or separated by commas")}</label>
          <textarea id={`ow-list-${offer.id}`} className="ow-textarea" rows={4} value={list} onChange={(event) => { setList(event.target.value); setReach(null); }} />
        </div>
      )}
      <div className="rb-actions">
        <Button variant="secondary" busy={busy} onClick={() => void run("preview")}>
          {t("See who this reaches")}
        </Button>
        {reach && reach.reachable > 0 && (
          <Button busy={busy} onClick={() => void run("send")}>
            {reach.reachable === 1 ? t("Send to 1 guest") : t("Send to {n} guests", { n: reach.reachable })}
          </Button>
        )}
      </div>
      {reach && (
        <p role="status">
          {reach.in_segment === 1 ? t("{n} of 1 guest in this group can be emailed.", { n: reach.reachable }) : t("{n} of {total} guests in this group can be emailed.", { n: reach.reachable, total: reach.in_segment })}
          {reach.skipped_no_consent > 0 && ` ${t("{n} did not say yes to offers, so they will not be contacted.", { n: reach.skipped_no_consent })}`}
        </p>
      )}
      {result && (
        <p role="status">
          {t("Sent to {n}.", { n: result.sent })} {result.skipped_recent_or_already > 0 && `${t("{n} skipped: they already have this offer or got another in the last {days} days.", { n: result.skipped_recent_or_already, days: limits.guest_cooldown_days })} `}
          {result.skipped_no_consent > 0 && `${t("{n} skipped: they did not say yes to offers.", { n: result.skipped_no_consent })} `}
          {result.left_for_today === 0 ? t("You have reached today's limit of {n} offer emails.", { n: limits.daily_cap }) : t("You can still send {n} today.", { n: result.left_for_today })}
        </p>
      )}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/** The shared link as a QR code to print: a poster in the window, a menu, a receipt. */
function QrBlock({ link, name, code }: { link: string; name: string; code: string }) {
  const { t } = useT();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="ow-qr">
      <QrImage text={link} label={t("QR code for the offer {name}", { name })} />
      <div>
        <p>
          <strong>{t("QR code")}</strong>
        </p>
        <p className="rb-muted">{t("Print it where guests can scan it. It opens your restaurant's page with the code already filled in.")}</p>
        <Button
          variant="secondary"
          onClick={() => setProblem(downloadQr(link, t("QR code for the offer {name}", { name }), `offer-${code}.svg`) ? null : t("We could not make the file. Copy the link instead."))}
        >
          {t("Download QR code (SVG)")}
        </Button>
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
