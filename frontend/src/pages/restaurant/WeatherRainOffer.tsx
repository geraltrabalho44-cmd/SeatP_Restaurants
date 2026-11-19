import {useState} from "react";
import {useParams} from "react-router-dom";
import {api} from "../../api/client";
import {Button,PageShell} from "../../design/components";
import {useT} from "../../i18n/I18nProvider";
import {useLoad} from "./useLoad";

interface Offer {status:string;restaurant:string;table:string;rain_at:string;expires:string;probability:number}
export function RainCard({path}:{path:string}){
  const {t}=useT();
  const {state,setData}=useLoad(()=>api.get<Offer|null>(path,"none"),path);
  const [busy,setBusy]=useState(false);
  const [problem,setProblem]=useState("");
  if(state.status==="loading") return null;
  if(state.status==="error") return path.startsWith("/rain/")?<p role="alert">{t("This rain offer is unavailable.")}</p>:null;
  const offer=state.data;
  if(!offer) return null;
  const choose=async(choice:"accept"|"decline")=>{
    setBusy(true);setProblem("");
    try{setData(await api.post<Offer>(path+"/"+choice,{},"none"));}
    catch(error){setProblem(error instanceof Error?error.message:t("Unable to update the offer."));}
    finally{setBusy(false);}
  };
  return <section className="rb-card"><h2>{t("Rain plan")} · {offer.restaurant}</h2>
    {offer.status==="offered"?<><p>{t("Rain expected at {time} ({chance}%). Indoor table {table} is held until {until}.", { time: offer.rain_at, chance: offer.probability, table: offer.table, until: offer.expires.slice(11,16) })}</p>
    <p>{t("Your time and party stay the same. Moving removes your previous chair request.")}</p>
    <Button busy={busy} onClick={()=>void choose("accept")}>{t("Move me inside")}</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>void choose("decline")}>{t("Keep my terrace table")}</Button></>:
    <p role="status">{offer.status==="accepted"?t("You are booked at indoor table {table}.", { table: offer.table }):offer.status==="declined"?t("You are keeping the terrace table."):t("This indoor table is no longer held.")}</p>}
    {problem && <p role="alert">{problem}</p>}</section>;
}
export default function WeatherRainOffer(){
  const {t}=useT();
  const {token=""}=useParams();
  return <PageShell title={t("Rain plan")} restaurantBrand><RainCard key={token} path={"/rain/"+encodeURIComponent(token)} /></PageShell>;
}
