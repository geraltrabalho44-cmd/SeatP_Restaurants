import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PartyNeeds } from "../../api/restaurant";
import { Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { shortDate } from "./format";

// The server names the weather in English; this puts it in the language in use.
const words = (condition: string): string => ({ "Rain expected": tr("Rain expected"), "Showers possible": tr("Showers possible"), Cloudy: tr("Cloudy"), "Sun and clouds": tr("Sun and clouds"), Sunny: tr("Sunny"), "Clear sky": tr("Clear sky"), "Partly cloudy": tr("Partly cloudy") })[condition] ?? condition;
/** After sunset the sun is not up, so the server's "Sunny" reads "Clear sky" (and "Sun and clouds" "Partly cloudy"). */
const atNight = (condition: string, time: string, sunset: string | null): string => sunset && time >= sunset ? ({ Sunny: "Clear sky", "Sun and clouds": "Partly cloudy" } as Record<string, string>)[condition] ?? condition : condition;

interface Table {id:number; label:string; room:string}
interface Hour {time:string; condition:string; temperature:number; probability:number; wind:number}
interface Forecast {located:boolean; city?:string|null; source:string; status:string; hours:Hour[]; sunset:string|null; indoor:Table[];
  sunset_choices:{time:string; tables:Table[]}[]}
/** The town as the page should say it: Lisboa is Lisbon in English and Lisbonne in French. */
const cityName=(city:string|null|undefined,locale:string):string|null=>!city?null:/^lisbo[an]?$/i.test(city)?({en:"Lisbon",fr:"Lisbonne"} as Record<string,string>)[locale]??"Lisboa":city;
/** `compact` (a phone on the table step) folds the forecast into one line that opens on a tap, so the plan stays on the first screen. */
export function WeatherPanel({venueId,needs,time,onTime,onTable,compact=false}:{venueId:string;needs:PartyNeeds;time?:string;
    onTime?:(time:string)=>void;onTable?:(id:number)=>void;compact?:boolean}) {
  const query=new URLSearchParams({day:needs.date,party:String(needs.party),accessible:String(needs.needs_accessible),high_chairs:String(needs.high_chairs)});
  if(time) query.set("at",time);
  const { t, locale } = useT();
  const path="/r/"+encodeURIComponent(venueId)+"/weather?"+query;
  const [result,setResult]=useState<{path:string;data:Forecast}|null>(null);
  useEffect(()=>{
    let active=true;
    api.get<Forecast>(path,"none").then(data=>{if(active)setResult({path,data});}).catch(()=>{});
    return ()=>{active=false;};
  },[path]);
  if(result?.path!==path || !result.data?.located) return null;
  const data=result.data;
  // One reading of the weather, not three: the hour the diner picked, else the evening (19:00), else lunch, else 21:00.
  const chosen=time ? data.hours.find(h=>h.time.slice(0,2)===time.slice(0,2)) : ["19:00","13:00","21:00"].map(x=>data.hours.find(h=>h.time===x)).find(Boolean);
  const hours=chosen?[chosen]:[];
  const best=time ? data.sunset_choices.find(c=>c.time===time) : data.sunset_choices[0];
  const town=cityName(data.city,locale);
  const heading=town ? t("Weather for {date} in {city}", { date: shortDate(needs.date), city: town }) : t("Weather for {date}", { date: shortDate(needs.date) });
  // The weather and the sunset are one line, so the card stays short. "Sunset at 17:19" is never broken in two.
  const sunsetText=data.sunset ? t("Sunset at {time}", { time: data.sunset }) : "";
  const readings=hours.map(h=>h.time+" · "+words(atNight(h.condition,h.time,data.sunset))+" · "+h.temperature+"°C"+(h.probability>=30?" ("+h.probability+"%)":"")+(h.wind>=35?" · "+t("Windy"):""));
  const weatherLine=<>{readings.join(" / ")}{readings.length>0&&sunsetText?" / ":""}{sunsetText&&<span className="rb-nowrap">{sunsetText}</span>}</>;
  const body=<>
    {hours.length>0 ? <><p>{weatherLine}</p>
      {data.status==="stale"&&<small>{t("Last available forecast")}</small>}</> :
      <><p>{data.status==="later"?t("The forecast for this date comes later."):t("Weather forecast unavailable right now.")}</p>{sunsetText&&<p>{sunsetText}</p>}</>}
    {best && <p>{t("Best table:")} {best.tables[0].room} · {best.tables[0].label}. {onTime && <Button variant="secondary" onClick={()=>onTime(best.time)}>{t("Choose {time}", { time: best.time })}</Button>}
      {onTable && <Button variant="secondary" onClick={()=>onTable(best.tables[0].id)}>{t("Choose {label}", { label: best.tables[0].label })}</Button>}</p>}
  </>;
  if(compact){
    const first=hours[0];
    return <details className="rb-card rb-weather-compact" aria-label={t("Weather and sunset")}>
      <summary>{first ? <><strong>{t("Weather")}</strong><span>{first.time+" · "+words(atNight(first.condition,first.time,data.sunset))+" · "+first.temperature+"°C"}</span></> : <strong>{heading}</strong>}</summary>
      <strong>{heading}</strong>
      {body}
    </details>;
  }
  return <section className="rb-card" aria-label={t("Weather and sunset")}>
    <strong>{heading}</strong>
    {body}
  </section>;
}
