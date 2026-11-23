// Route /staff/:venueId: the staff screen, laptop first. Four tabs: the live
// floor, the day's numbers, the optimiser for a whole service, and the schedule.
//
// Tabs follow the WAI-ARIA tabs pattern: one tab stop for the tab list,
// Left and Right arrows move between tabs, and each tab panel is labelled
// by its tab.
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getStaffRestaurant } from "../../api/restaurant";
import { getOwnerProfile } from "../../api/owner";
import { Wordmark } from "../../design/components/PageShell";
import { PageShell } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { LanguagePicker } from "../../i18n/LanguagePicker";
import { formatDate, todayIso } from "./format";
import { StaffDashboard } from "./StaffDashboard";
import { StaffFloor } from "./StaffFloor";
import { StaffOptimise } from "./StaffOptimise";
import { StaffSchedule } from "./StaffSchedule";
import "./restaurant.css";
import "./staff.css";

type Tab = "floor" | "dashboard" | "optimise" | "schedule";

const TABS: { id: Tab; label: Message }[] = [
  { id: "floor", label: "Floor" },
  { id: "dashboard", label: "Dashboard" },
  { id: "optimise", label: "Optimise" },
  { id: "schedule", label: "Schedule" },
];

export default function StaffPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("floor");
  const [scheduleVisited, setScheduleVisited] = useState(false);
  const changeTab = (next: Tab): void => { if (next === "schedule") setScheduleVisited(true); setTab(next); };
  const [date, setDate] = useState(todayIso());
  const ownerEntry = useLocation().pathname.startsWith("/owner/");
  const [restaurant, setRestaurant] = useState<{ name: string; timezone: string } | null>(null);
  useEffect(() => {
    let current = true;
    setRestaurant(null);
    const metadata = ownerEntry ? getOwnerProfile(venueId) : getStaffRestaurant(venueId);
    void metadata.then(info => { if (current) setRestaurant(info); }, () => undefined);
    return () => { current = false; };
  }, [venueId, ownerEntry]);
  return (
    <PageShell title={t("Service floor")} width="wide">
      <div className="st-page">
        <aside className="st-sidebar"><Wordmark/><LanguagePicker /><p className="st-workspace-label">{t("Staff workspace")}</p><TabList current={tab} onChange={changeTab} /><Link className="st-home-link" to={ownerEntry ? "/owner" : "/"}>{ownerEntry ? t("My restaurants") : t("Find restaurants")}</Link></aside>
        <div className="st-content">
        <div className="st-top">
          <div>
            <p className="st-restaurant-name">{restaurant?.name ?? t("Restaurant {id}", { id: venueId })}</p>
            <h1 className="st-title">{t("Service floor")}</h1>
            <p className="rb-muted">{formatDate(date)}</p>
          </div>
          <label className="st-date">
            <span className="field-label">{t("Day")}</span>
            <input className="field-input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        {tab !== "schedule" && <div role="tabpanel" id={`st-panel-${tab}`} aria-labelledby={`st-tab-${tab}`} className="st-panel">
          {tab === "floor" && <StaffFloor key={`${venueId}|${date}`} venueId={venueId} date={date} timezone={restaurant?.timezone} onToday={() => setDate(new Intl.DateTimeFormat("sv-SE", {timeZone:restaurant?.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))} />}
          {tab === "dashboard" && <StaffDashboard venueId={venueId} date={date} onOpenSchedule={() => {changeTab("schedule");window.requestAnimationFrame(() => document.getElementById("st-tab-schedule")?.focus());}} />}
          {tab === "optimise" && <StaffOptimise venueId={venueId} date={date} />}
        </div>}
        {scheduleVisited && <div role="tabpanel" id="st-panel-schedule" aria-labelledby="st-tab-schedule" className="st-panel" hidden={tab !== "schedule"}><StaffSchedule key={venueId} venueId={venueId} /></div>}
        </div>
      </div>
    </PageShell>
  );
}

function TabList({ current, onChange }: { current: Tab; onChange: (tab: Tab) => void }) {
  const { t: say } = useT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [vertical,setVertical]=useState(()=>window.innerWidth>1024);
  useEffect(()=>{const resize=()=>setVertical(window.innerWidth>1024);window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);},[]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === current);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = (index + step + TABS.length) % TABS.length;
    onChange(TABS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-orientation={vertical ? "vertical" : "horizontal"} aria-label={say("Staff views")} className="st-tabs" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`st-tab-${t.id}`}
          aria-selected={t.id === current}
          aria-controls={`st-panel-${t.id}`}
          tabIndex={t.id === current ? 0 : -1}
          className="st-tab"
          onClick={() => onChange(t.id)}
        >
          {say(t.label)}
        </button>
      ))}
    </div>
  );
}
