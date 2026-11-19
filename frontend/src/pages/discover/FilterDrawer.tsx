import { useT } from "../../i18n/I18nProvider";
import type {ReactNode} from "react";
import type {FeatureKey} from "../../api/discovery";
import {CUISINES} from "../../api/owner";
import {Button,Dialog} from "../../design/components";
import {Chip,Chips,toggle} from "./Chips";
import {cuisineLabel,DISCOVERY_FEATURE_LABELS as LABELS} from "./discoverModel";
export const QUICK_FEATURES:FeatureKey[]=["sun","view","terrace"];
interface Props {
 open:boolean;onClose:()=>void;onApply:()=>void;
 cuisines:string[];onCuisines:(value:string[])=>void;prices:number[];onPrices:(value:number[])=>void;
 features:FeatureKey[];onFeatures:(value:FeatureKey[])=>void;
 allCuisines:boolean;onAllCuisines:(value:boolean)=>void;hasWhen:boolean;
 availableOnly:boolean;onAvailableOnly:(value:boolean)=>void;onClear:()=>void;total:number|null;
 narrowExtras?:ReactNode;showQuick:boolean;
}
export function FilterDrawer(p:Props){
  const {t,label} = useT();
 return <div className="discover-filters-modal"><Dialog open={p.open} title={t("Filters")} onClose={p.onClose} placement="side" actions={<>
  <Button variant="ghost" onClick={p.onClear}>{t("Clear filters")}</Button>
  <Button onClick={p.onApply}>{t("Apply")}{p.total===null?" filters":` · Show ${p.total} ${p.total===1?t("restaurant"):t("restaurants")}`}</Button>
 </>}>
  <button type="button" className="discover-filter-close" aria-label={t("Cancel filters")} onClick={p.onClose}>×</button>
  <div className="discover-drawer">
   <section className="discover-context-group"><h3>{t("When and where")}</h3>{p.narrowExtras}</section>
   <Chips label={t("Room features")}>{QUICK_FEATURES.map(key=><Chip key={key} pressed={p.features.includes(key)} onClick={()=>p.onFeatures(toggle(p.features,key))}>{label(LABELS[key])}</Chip>)}<p className="discover-filter-note">{t("Sunlight at your booking time appears on the table map.")}</p></Chips>
   <Chips label={t("Accessibility")}><Chip pressed={p.features.includes("accessible")} onClick={()=>p.onFeatures(toggle(p.features,"accessible"))}>{t("Wheelchair-accessible table")}</Chip><p className="discover-filter-note">{t("High chair requests are available when booking.")}</p></Chips>
   <div className="discover-filter-selects">
    <details><summary><span>{t("Cuisine")}</span><strong>{p.cuisines.length?p.cuisines.map(c=>label(cuisineLabel(c))).join(", "):t("Any")}</strong></summary><Chips label={t("Cuisine")}>{CUISINES.filter((key,i)=>p.allCuisines||i<8||p.cuisines.includes(key)).map(key=><Chip key={key} pressed={p.cuisines.includes(key)} onClick={()=>p.onCuisines(toggle(p.cuisines,key))}>{label(cuisineLabel(key))}</Chip>)}<button type="button" className="discover-more" aria-expanded={p.allCuisines} onClick={()=>p.onAllCuisines(!p.allCuisines)}>{p.allCuisines?t("Fewer cuisines"):t("More cuisines")}</button></Chips></details>
    <details><summary><span>{t("Price")}</span><strong>{p.prices.length?p.prices.map(n=>"€".repeat(n)).join(", "):t("Any")}</strong></summary><Chips label={t("Price")}>{[1,2,3,4].map(n=><Chip key={n} label={`${"€".repeat(n)}, price level ${n} of 4`} pressed={p.prices.includes(n)} onClick={()=>p.onPrices(toggle(p.prices,n))}>{"€".repeat(n)}</Chip>)}</Chips></details>
   </div>
   {p.hasWhen&&<Chips label={t("Availability")}><Chip pressed={p.availableOnly} onClick={()=>p.onAvailableOnly(!p.availableOnly)}>{t("Available near this time")}</Chip><p className="discover-filter-note">{t("Includes seating times within 60 minutes of your chosen time.")}</p></Chips>}
  </div>
 </Dialog></div>;
}
