import { useT } from "../../i18n/I18nProvider";
// Search context has its own row; name/cuisine and the room filters stay beneath it.
import {Button} from "../../design/components";
import {Chip,toggle} from "./Chips";
import {ContextControls} from "./ContextControls";
import type {Place} from "./discoverModel";
import {QUICK_CUISINES} from "./FilterDrawer";
import {cuisineLabel} from "./discoverModel";
interface Props {
 wide:boolean;text:string;onText:(value:string)=>void;place:Place|null;onPlace:(place:Place|null)=>void;
 locating:boolean;onNearMe:()=>void;date:string;time:string;party:string;onDate:(value:string)=>void;onTime:(value:string)=>void;onParty:(value:string)=>void;onClearWhen:()=>void;
 cuisines:string[];onCuisines:(value:string[])=>void;filterCount:number;drawerOpen:boolean;onDrawer:()=>void;
}
export function DiscoverBar(p:Props){
  const {t,label} = useT();
 const search=<div className="discover-search-field"><label className="visually-hidden" htmlFor="discover-search">{t("Restaurant or cuisine")}</label><span aria-hidden="true">⌕</span><input id="discover-search" type="search" aria-label={t("Restaurant or cuisine")} placeholder={t("Restaurant or cuisine")} value={p.text} maxLength={140} autoComplete="off" onChange={e=>p.onText(e.target.value)}/>{p.text&&<button type="button" aria-label={t("Clear search")} onClick={()=>p.onText("")}>×</button>}</div>;
 return <form className="discover-bar" role="search" onSubmit={e=>{e.preventDefault();if(p.wide && !p.date)document.querySelector<HTMLInputElement>('input[type="date"]')?.focus();else {const results=document.getElementById("discover-results-title");results?.focus();results?.scrollIntoView?.({block:"nearest"});}}}>
  {p.wide&&<div className="discover-primary"><ContextControls variant="capsule" place={p.place} onPlace={p.onPlace} date={p.date} time={p.time} party={p.party} onDate={p.onDate} onTime={p.onTime} onParty={p.onParty} onClearWhen={p.onClearWhen}/><Button type="submit">{t("Find a table →")}</Button></div>}
  <div className="discover-secondary">{search}{p.wide&&<div className="discover-quick" role="group" aria-label={t("Quick filters")}>{QUICK_CUISINES.map(key=><Chip key={key} pressed={p.cuisines.includes(key)} onClick={()=>p.onCuisines(toggle(p.cuisines,key))}>{label(cuisineLabel(key))}</Chip>)}</div>}<Button variant="secondary" aria-haspopup="dialog" aria-expanded={p.drawerOpen} onClick={p.onDrawer}>{t("Filters")}{p.filterCount?` (${p.filterCount})`:""}<span aria-hidden="true"> ☷</span></Button>{p.wide&&<Button variant="ghost" busy={p.locating} onClick={p.onNearMe}>{t("Near me")}</Button>}</div>
 </form>;
}
