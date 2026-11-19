import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PartyNeeds } from "../../api/restaurant";
import { Button } from "../../design/components";

interface Table {id:number; label:string; room:string}
interface Hour {time:string; condition:string; temperature:number; probability:number; wind:number}
interface Forecast {located:boolean; source:string; status:string; hours:Hour[]; sunset:string|null; indoor:Table[];
  sunset_choices:{time:string; tables:Table[]}[]}
export function WeatherPanel({venueId,needs,time,onTime,onTable}:{venueId:string;needs:PartyNeeds;time?:string;
    onTime?:(time:string)=>void;onTable?:(id:number)=>void}) {
  const query=new URLSearchParams({day:needs.date,party:String(needs.party),accessible:String(needs.needs_accessible),high_chairs:String(needs.high_chairs)});
  if(time) query.set("at",time);
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
  return <section className="rb-card" aria-label="Weather and sunset">
    <strong>Weather for {needs.date}</strong>
    {hours.length>0 ? <><p>{hours.map(h=>h.time+" · "+h.condition+" · "+h.temperature+"°C"+(h.probability>=30?" ("+h.probability+"%)":"")+(h.wind>=35?" · Windy":"")).join(" / ")}</p>
      <small>{data.source==="demo"?"Simulated weather (demo)":<a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Weather data by Open-Meteo.com</a>}{data.status==="stale"?" · Last available forecast":""}</small></> :
      <p>{data.status==="later"?"The forecast for this date comes later.":"Weather forecast unavailable right now."}</p>}
    {rain && <p>Indoor tables recommended.{data.indoor.map(table=><Button key={table.id} variant="ghost" onClick={()=>onTable?.(table.id)}>{table.room} · {table.label}</Button>)}</p>}
    {data.sunset && <p>Sunset at {data.sunset}. {best?<>Best table: {best.tables[0].room} · {best.tables[0].label}. {onTime && <Button variant="secondary" onClick={()=>onTime(best.time)}>Choose {best.time}</Button>}
      {onTable && <Button variant="secondary" onClick={()=>onTable(best.tables[0].id)}>Choose {best.tables[0].label}</Button>}</>:!time?"No available seating catches the sunset on this day.":""}</p>}
  </section>;
}
