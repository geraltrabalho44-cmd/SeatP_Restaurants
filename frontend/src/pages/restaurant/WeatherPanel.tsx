import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PartyNeeds } from "../../api/restaurant";
import { Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { shortDate } from "./format";

// The server names the weather in English; this puts it in the language in use.
const words = (condition: string): string => ({ "Rain expected": tr("Rain expected"), "Showers possible": tr("Showers possible"), Cloudy: tr("Cloudy"), "Sun and clouds": tr("Sun and clouds"), Sunny: tr("Sunny") })[condition] ?? condition;

interface Table {id:number; label:string; room:string}
interface Hour {time:string; condition:string; temperature:number; probability:number; wind:number}
interface Forecast {located:boolean; source:string; status:string; hours:Hour[]; sunset:string|null; indoor:Table[];
  sunset_choices:{time:string; tables:Table[]}[]}
/** `compact` (a phone on the table step) folds the forecast into one line that opens on a tap, so the plan stays on the first screen. */
export function WeatherPanel({venueId,needs,time,onTime,onTable,compact=false}:{venueId:string;needs:PartyNeeds;time?:string;
    onTime?:(time:string)=>void;onTable?:(id:number)=>void;compact?:boolean}) {
  const query=new URLSearchParams({day:needs.date,party:String(needs.party),accessible:String(needs.needs_accessible),high_chairs:String(needs.high_chairs)});
  if(time) query.set("at",time);
  const { t } = useT();
  const path="/r/"+encodeURIComponent(venueId)+"/weather?"+query;
  const [result,setResult]=useState<{path:string;data:Forecast}|null>(null);
  useEffect(()=>{
    let active=true;
    api.get<Forecast>(path,"none").then(data=>{if(active)setResult({path,data});}).catch(()=>{});
    return ()=>{active=false;};
  },[path]);
  if(result?.path!==path || !result.data?.located) return null;
  const data=result.data;
  const hours=time ? data.hours.filter(h=>h.time.slice(0,2)===time.slice(0,2)) : data.hours.filter(h=>["13:00","19:00","21:00"].includes(h.time));
  const rain=hours.some(h=>h.condition==="Rain expected" || h.condition==="Showers possible");
  const best=time ? data.sunset_choices.find(c=>c.time===time) : data.sunset_choices[0];
  const heading=t("Weather for {date}", { date: shortDate(needs.date) });
  const body=<>
    {hours.length>0 ? <><p>{hours.map(h=>h.time+" · "+words(h.condition)+" · "+h.temperature+"°C"+(h.probability>=30?" ("+h.probability+"%)":"")+(h.wind>=35?" · "+t("Windy"):"")).join(" / ")}</p>
      <small>{data.source==="demo"?t("Simulated forecast"):<a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">{t("Weather data by Open-Meteo.com")}</a>}{data.status==="stale"?" · "+t("Last available forecast"):""}</small></> :
      <p>{data.status==="later"?t("The forecast for this date comes later."):t("Weather forecast unavailable right now.")}</p>}
    {rain && <p>{t("Indoor tables recommended.")}{data.indoor.map(table=><Button key={table.id} variant="ghost" onClick={()=>onTable?.(table.id)}>{table.room} · {table.label}</Button>)}</p>}
    {data.sunset && <p>{t("Sunset at {time}.", { time: data.sunset })} {best?<>{t("Best table:")} {best.tables[0].room} · {best.tables[0].label}. {onTime && <Button variant="secondary" onClick={()=>onTime(best.time)}>{t("Choose {time}", { time: best.time })}</Button>}
      {onTable && <Button variant="secondary" onClick={()=>onTable(best.tables[0].id)}>{t("Choose {label}", { label: best.tables[0].label })}</Button>}</>:!time?t("No available seating catches the sunset on this day."):""}</p>}
  </>;
  if(compact){
    const first=hours[0];
    return <details className="rb-card rb-weather-compact" aria-label={t("Weather and sunset")}>
      <summary>{first ? <><strong>{t("Weather")}</strong><span>{first.time+" · "+words(first.condition)+" · "+first.temperature+"°C"}</span></> : <strong>{heading}</strong>}</summary>
      <strong>{heading}</strong>
      {body}
    </details>;
  }
  return <section className="rb-card" aria-label={t("Weather and sunset")}>
    <strong>{heading}</strong>
    {body}
  </section>;
}
