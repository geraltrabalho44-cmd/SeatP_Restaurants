import { useT } from "../../i18n/I18nProvider";
import { activeLocale, activeTag, tr } from "../../i18n/locale";
// The home page (spec 9.1): search restaurants by name or cuisine, near me or in a city, with
// filters and an optional date, time and party, as a list with a map beside it (a List/Map
// switch on a phone). One sticky command bar holds the search and the quick controls; the
// secondary filters are in a drawer. Twenty results at a time, "Show more" for the rest.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchRestaurants } from "../../api/discovery";
import type { FeatureKey, RestaurantCard as Card, SearchQuery, SearchWhen } from "../../api/discovery";
import { Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { ContextControls } from "./ContextControls";
import { DiscoverBar } from "./DiscoverBar";
import { FilterDrawer, QUICK_CUISINES } from "./FilterDrawer";
import { PublicHeaderActions } from "./PublicHeaderActions";
import { RestaurantCard } from "./RestaurantCard";
import { completeWhen, cuisineLabel, DISCOVERY_FEATURE_LABELS, loadPlace, savePlace } from "./discoverModel";
import type { Place } from "./discoverModel";
import { emptyDiscoveryState, loadDiscoveryState, saveDiscoveryState } from "./discoveryState";
import { FIRST_HEADLINE, visitHeadline } from "./visitHeadline";
import "./discover.css";
const ResultsMap = lazy(() => import("../../maps/ResultsMap"));
const PAGE = 20;
const DEFAULT_TIME = "20:00";
type Results = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Card[]; total: number; key: string; when: SearchWhen | null };
function useWide(): boolean {
  const query = "(min-width: 64rem)";
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const change = (): void => setWide(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return wide;
}
/** "Lisboa · 20 Nov, 20:00 · 2 people": the context on a phone, where the controls are in the drawer. */
function contextSummary(place: Place | null, date: string, time: string, party: string): string {
  const where = place?.label === "Lisboa" ? (activeLocale() === "en" ? "Lisbon" : "Lisboa") : place?.label ?? tr("Anywhere");
  const people = party === "1" ? tr("1 person") : tr("{count} people", { count: party });
  if (!date) return `${where} · ${tr("Any date")} · ${people}`;
  const [year, month, day] = date.split("-").map(Number);
  const when = new Date(year, month - 1, day).toLocaleDateString(activeTag(), { day: "numeric", month: "short" });
  return `${where} · ${when}, ${time} · ${people}`;
}
/** `fresh`: the visitor clicked the logo, so the page starts as on arriving, with no place, filters, search or scroll kept. */
/** The map of the home page opens on Lisbon until the visitor chooses a place. */
const HOME_VIEW = { lat: 38.7223, lng: -9.1393, zoom: 13 };

export default function DiscoverPage({ fresh = false }: { fresh?: boolean } = {}) {
  const {t,label,locale} = useT();
  const [saved] = useState(fresh ? emptyDiscoveryState : loadDiscoveryState);
  const [headline, setHeadline] = useState(FIRST_HEADLINE);
  useEffect(() => setHeadline(visitHeadline()), []);
  const [text, setText] = useState(saved.text);
  const [q, setQ] = useState(saved.text);
  const [cuisines, setCuisines] = useState<string[]>(saved.cuisines);
  const [prices, setPrices] = useState<number[]>(saved.prices);
  const [features, setFeatures] = useState<FeatureKey[]>(saved.features);
  const [place, setPlace] = useState<Place | null>(fresh ? null : loadPlace);
  useEffect(() => { if (fresh) { savePlace(null); window.scrollTo?.(0, 0); } }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the page opens fresh
  const [date, setDate] = useState(saved.date);
  const [time, setTime] = useState(saved.time);
  const [party, setParty] = useState(saved.party);
  const [availableOnly, setAvailableOnly] = useState(saved.availableOnly);
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState({cuisines, prices, features, place, date, time, party, availableOnly});
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const openFilters = (): void => {setDraft({cuisines, prices, features, place, date, time, party, availableOnly});setDrawer(true);};
  const applyFilters = (): void => {
    setCuisines(draft.cuisines);setPrices(draft.prices);setFeatures(draft.features);
    setDate(draft.date);setTime(draft.time);setParty(draft.party);setAvailableOnly(draft.availableOnly);
    setPlace(draft.place);savePlace(draft.place);setDrawer(false);
  };
  useEffect(() => {
    if (!drawer) return;
    let current = true;
    setPreviewTotal(null);
    const delay = window.setTimeout(() => {
      const previewWhen = completeWhen(draft.date,draft.time,Number(draft.party));
      void searchRestaurants({q,cuisines:draft.cuisines,prices:draft.prices,features:draft.features,place:draft.place,when:previewWhen,availableOnly:draft.availableOnly&&previewWhen!==null,limit:20,offset:0}).then(answer=>{if(current)setPreviewTotal(answer.total);},()=>{if(current)setPreviewTotal(null);});
    },250);
    return () => {current=false;window.clearTimeout(delay);};
  },[drawer,draft,q]);
  const [allCuisines, setAllCuisines] = useState(false);
  const [view, setView] = useState<"list" | "map">(saved.view);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(saved.pinned ?? null);
  const [mapFocus, setMapFocus] = useState<{ id: string } | null>(null);
  // True while the numbered diagram stands in for a map whose tiles failed.
  const [, setDiagram] = useState(false);
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [interpreted,setInterpreted] = useState<string[]>([]);
  const [moreError, setMoreError] = useState("");
  const wide = useWide();
  const request = useRef(0);
  // The search box waits for a pause in typing before it asks the server.
  useEffect(() => {
    const id = window.setTimeout(() => setQ(text), 300);
    return () => window.clearTimeout(id);
  }, [text]);
  const when = completeWhen(date, time, Number(party));
  const query: SearchQuery = useMemo(
    () => ({ q, cuisines, prices, features, place: place ? { lat: place.lat, lng: place.lng } : null, when, availableOnly: availableOnly && when !== null, limit: PAGE, offset: 0 }),
    // `when` is rebuilt every render, so depend on its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, cuisines, prices, features, place, date, time, party, availableOnly],
  );
  const queryKey = JSON.stringify(query);
  const originalQuery = useRef(queryKey);
  const restoredScroll = useRef(false);
  const search = useCallback((): void => {
    const id = ++request.current;
    setResults((now) => (now.status === "ready" ? now : { status: "loading" }));
    setMoreError("");
    const load = async () => {
      const answer = await searchRestaurants(query);
      const pages = queryKey === originalQuery.current ? saved.pages : 1;
      while (id === request.current && answer.items.length < answer.total && answer.items.length < pages * PAGE) {
        const next = await searchRestaurants({ ...query, offset: answer.items.length });
        if (!next.items.length) break;
        answer.items.push(...next.items);
        answer.total = next.total;
      }
      return answer;
    };
    void load().then(
      (answer) => {if(id === request.current) {
        setInterpreted(answer.understood?.chips ?? []);
        setResults({status:"ready",items:answer.items,total:answer.total,key:queryKey,when:answer.understood?.when ?? when});
      }},
      (error: unknown) => id === request.current && setResults({ status: "error", message: errorMessage(error, tr("We could not load the restaurants. Please try again.")) }),
    );
    // The key stands for the whole query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  useEffect(search, [search]);
  const updating = results.status === "ready" && (results.key !== queryKey || text !== q);
  const showMore = async (): Promise<void> => {
    if (results.status !== "ready" || updating || loadingMore) return;
    const id = ++request.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const answer = await searchRestaurants({ ...query, offset: results.items.length });
      if (id === request.current) setResults({ ...results, items: [...results.items, ...answer.items], total: answer.total });
    } catch (error) {
      if (id === request.current) setMoreError(errorMessage(error, tr("We could not load more. Please try again.")));
    } finally {
      setLoadingMore(false);
    }
  };
  const choosePlace = (next: Place | null): void => {
    setPlace(next);
    savePlace(next);
  };
  // Picking a date is enough to ask "what is free": the time starts at dinner, ready to change.
  const changeDate = (value: string): void => {
    setDate(value);
    if (value && !time) setTime(DEFAULT_TIME);
  };
  const clearWhen = (): void => {
    setDate("");
    setTime("");
  };
  // On a wide screen the quick kinds of food sit in the bar, so the button counts only what is inside the drawer.
  const quickCuisines = cuisines.filter((c) => (QUICK_CUISINES as readonly string[]).includes(c)).length;
  const filterCount = cuisines.length - (wide ? quickCuisines : 0) + prices.length + features.length;

  const items = results.status === "ready" ? results.items : [];
  const pins = useMemo(
    () => items.map((c,index) => ({ id: c.public_id, name: c.name, lat: c.lat as number, lng: c.lng as number, number: index + 1 })).filter(pin => pin.lat !== null && pin.lng !== null),
    [items],
  );
  // The diagram numbers its pins in list order; cards wear the same numbers.
  const pinNumbers = useMemo(() => new Map(items.map((card, index) => [card.public_id, index + 1])), [items]);
  const previewCard = (id: string | null): void => {
    setHighlighted(id);
    if (id !== null) setPinned(current => current === id ? current : null);
  };
  const selectCard = (id: string): void => {
    setPinned(id);
    setMapFocus({ id });
  };
  const selectPin = (id: string): void => {
    setPinned(id);
    const card = document.getElementById(`card-${id}`);
    if (wide) {
      card?.scrollIntoView?.({ block: "nearest", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      card?.querySelector<HTMLAnchorElement>("h3 a")?.focus({ preventScroll: true });
    } else window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#discover-selected-result button")?.focus({preventScroll:true}));
  };
  const closePinSummary = (): void => {
    // A hidden Leaflet map remains mounted behind the fallback diagram.
    const pin = document.querySelector<HTMLElement>('.schematic-pin[aria-pressed="true"]') ?? document.querySelector<HTMLElement>(".discover-pin-selected");
    setPinned(null);
    window.requestAnimationFrame(() => pin?.focus({preventScroll:true}));
  };
  useEffect(() => {
    const persist = (): void => saveDiscoveryState({text,cuisines,prices,features,date,time,party,availableOnly,view,scroll:window.scrollY,pages:Math.max(1,Math.ceil(items.length/PAGE)),pinned});
    persist();
    window.addEventListener("scroll",persist,{passive:true});
    return () => window.removeEventListener("scroll",persist);
  }, [text,cuisines,prices,features,date,time,party,availableOnly,view,items.length,pinned]);
  useEffect(() => {
    if (results.status === "ready" && !restoredScroll.current) {
      restoredScroll.current = true;
      if (saved.scroll > 0) window.requestAnimationFrame(() => window.scrollTo(0,saved.scroll));
    }
  }, [results,saved.scroll]);
  const showMap = wide || view === "map";
  const selectedCard = items.find(card => card.public_id === pinned);
  // Hover and selection share one outline, including when the pointer is over the selected card.
  const previewId = highlighted === pinned ? null : highlighted;
  return <div className={`discover-route${!wide && view === "map" ? " is-map-view" : ""}`}><PageShell title={t("Find a table you will love")} width="wide" restaurantBrand headerActions={<PublicHeaderActions />}>
    <section className={`discover-top${!wide && view === "map" ? " discover-top-compact" : ""}`} aria-labelledby="discover-heading">
      <h1 id="discover-heading" aria-label={wide || headline !== FIRST_HEADLINE ? label(headline) : t("Find your table.")}><span className="discover-desktop-title">{label(headline)}</span><span className="discover-mobile-title">{headline === FIRST_HEADLINE ? t("Find your table.") : label(headline)}</span></h1><p>{t("See the room and choose where you’ll sit.")}</p>
    </section>
    {!wide&&<button className="discover-summary" type="button" aria-label={`When and where: ${contextSummary(place,date,time,party)}`} aria-haspopup="dialog" aria-expanded={drawer} onClick={openFilters}>{contextSummary(place,date,time,party)} <span aria-hidden="true">▾</span></button>}
    <DiscoverBar wide={wide} text={text} onText={setText} place={place} onPlace={choosePlace} date={date} time={time} party={party} onDate={changeDate} onTime={setTime} onParty={setParty} onClearWhen={clearWhen} cuisines={cuisines} onCuisines={setCuisines} filterCount={filterCount} drawerOpen={drawer} onDrawer={openFilters}/>
      {interpreted.length>0 && text===q && <div className="discover-active" aria-label={t("Search interpretation")}>{interpreted.map((chip,index)=><button type="button" className="discover-chip" key={index} onClick={()=>{
        const fold=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
        const at=fold(text).indexOf(fold(chip));
        if(at>=0) setText((text.slice(0,at)+" "+text.slice(at+chip.length)).trim());
      }}>{chip} ×</button>)}</div>}
    <div className="discover-active" aria-label={t("Active filters")}>
      {cuisines.filter(key=>!wide||!(QUICK_CUISINES as readonly string[]).includes(key)).map(key=><button key={key} type="button" className="discover-chip" aria-label={`Remove ${label(cuisineLabel(key))}`} onClick={()=>setCuisines(cuisines.filter(c=>c!==key))}>{label(cuisineLabel(key))} ×</button>)}
      {prices.map(n=><button key={n} type="button" className="discover-chip" aria-label={`Remove price level ${n}`} onClick={()=>setPrices(prices.filter(p=>p!==n))}>{"€".repeat(n)} ×</button>)}
      {features.map(key=><button key={key} type="button" className="discover-chip" aria-label={`Remove ${label(DISCOVERY_FEATURE_LABELS[key])}`} onClick={()=>setFeatures(features.filter(f=>f!==key))}>{label(DISCOVERY_FEATURE_LABELS[key])} ×</button>)}
    </div>
    {features.includes("sun")&&<p className="discover-filter-note">{t("Sunlight at your booking time appears on the table map.")}</p>}
    <FilterDrawer open={drawer} onClose={()=>setDrawer(false)} onApply={applyFilters} cuisines={draft.cuisines} onCuisines={value=>setDraft({...draft,cuisines:value})} prices={draft.prices} onPrices={value=>setDraft({...draft,prices:value})} features={draft.features} onFeatures={value=>setDraft({...draft,features:value})} allCuisines={allCuisines} onAllCuisines={setAllCuisines} hasWhen={completeWhen(draft.date,draft.time,Number(draft.party))!==null} availableOnly={draft.availableOnly} onAvailableOnly={value=>setDraft({...draft,availableOnly:value})} onClear={()=>setDraft({...draft,cuisines:[],prices:[],features:[],availableOnly:true})} total={previewTotal} showQuick narrowExtras={<ContextControls variant="stacked" place={draft.place} onPlace={value=>setDraft({...draft,place:value})} date={draft.date} time={draft.time} party={draft.party} onDate={value=>setDraft({...draft,date:value,time:draft.time||(value?DEFAULT_TIME:"")})} onTime={value=>setDraft({...draft,time:value})} onParty={value=>setDraft({...draft,party:value})} onClearWhen={()=>setDraft({...draft,date:"",time:""})}/>}/>
    <div className="discover-results-head"><h2 id="discover-results-title" tabIndex={-1}>{text?t("Search results"):results.status==="ready"?`${results.total} ${results.total===1?t("restaurant"):t("restaurants")}${place?" "+t("near {place}",{place:place.label==="Lisboa" && locale==="en"?"Lisbon":place.label}):""}`:t("Finding restaurants")}</h2>
      {(features.length+cuisines.length+prices.length)>0&&<button type="button" className="discover-more" onClick={()=>{setCuisines([]);setPrices([]);setFeatures([]);}}>{t("Clear filters")}</button>}
      <div className="discover-view-switch" role="group" aria-label={t("Results view")}><Button variant={view==="list"?"primary":"secondary"} aria-pressed={view==="list"} onClick={()=>setView("list")}>{t("List")}</Button><Button variant={view==="map"?"primary":"secondary"} aria-pressed={view==="map"} onClick={()=>setView("map")}>{t("Map")}</Button></div>
      {wide&&when&&<p>{t("Around")} {when.time} · {t("Select a time to book")}</p>}
    </div>
    <div className={`discover-results discover-view-${view}${results.status==="ready"&&!items.length?" is-empty":""}`}>
      <section className="discover-list" aria-label={t("Restaurants")} aria-busy={results.status==="loading"||updating}>
        {updating&&<p role="status">{when?t("Updating availability…"):t("Updating restaurants…")}</p>}
        {results.status==="loading"&&<Skeleton label={t("Finding restaurants")} lines={6}/>}
        {results.status==="error"&&<ErrorState message={results.message} onRetry={search}/>}
        {results.status==="ready"&&<>
          {!items.length?<EmptyState title={text?t("No restaurants match “{text}”",{text}):when?t("No tables available around {time}",{time:when.time}):t("No restaurants match")} action={<><Button onClick={()=>{if(text){setText("");setQ("");}else openFilters();}}>{text?t("Clear search term"):when?t("Change time"):t("Edit filters")}</Button>{text&&<Button variant="secondary" onClick={openFilters}>{t("Edit filters")}</Button>}</>}><p>{text?t("Try a different name or clear the search term."):when?t("No restaurant has a free table for {party} on {date} around that time. Try another time or another day.",{party:Number(party)===1?t("1 person"):t("{count} people",{count:party}),date:new Date(`${when.date}T12:00:00`).toLocaleDateString(activeTag(),{weekday:"short",day:"numeric",month:"short"})}):t("Try another cuisine or room feature.")}</p></EmptyState>:<div className="discover-cards">{items.map(card=><RestaurantCard key={card.public_id} card={card} when={results.when} navigationWhen={when} pending={updating} priorityFeatures={features} selected={!previewId&&pinned===card.public_id} highlighted={previewId===card.public_id} onHighlight={previewCard} onSelect={() => selectCard(card.public_id)} number={pinNumbers.get(card.public_id)}/>)}</div>}
          {moreError&&<p role="alert">{moreError}</p>}
          {items.length<results.total&&<Button className="discover-load-more" variant="secondary" busy={loadingMore} disabled={updating} onClick={()=>void showMore()}>{t("Show more")}</Button>}
        </>}
      </section>
      {showMap&&<div className="discover-map-column"><Suspense fallback={<Skeleton label={t("Loading the map")} lines={4}/>}><ResultsMap pins={pins} highlightedId={previewId} selectedId={previewId ? null : pinned} centerRequest={mapFocus?.id === pinned ? mapFocus : null} onSelect={selectPin} center={place} home={HOME_VIEW} onFallback={setDiagram}/></Suspense>
        {!wide&&selectedCard&&<div id="discover-selected-result" className="discover-pin-summary" aria-live="polite"><RestaurantCard card={selectedCard} when={updating?null:when} navigationWhen={when} pending={updating} highlighted={false} selected onHighlight={()=>{}} number={pinNumbers.get(selectedCard.public_id)} compact/><button type="button" className="discover-map-close" aria-label={t("Close summary")} onClick={closePinSummary}>×</button></div>}
      </div>}
    </div>
  </PageShell></div>;
}
