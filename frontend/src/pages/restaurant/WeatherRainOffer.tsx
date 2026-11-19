import {useState} from "react";
import {useParams} from "react-router-dom";
import {api} from "../../api/client";
import {Button,PageShell} from "../../design/components";
import {useLoad} from "./useLoad";

interface Offer {status:string;restaurant:string;table:string;rain_at:string;expires:string;probability:number}
export function RainCard({path}:{path:string}){
  const {state,setData}=useLoad(()=>api.get<Offer|null>(path,"none"),path);
  const [busy,setBusy]=useState(false);
  const [problem,setProblem]=useState("");
  if(state.status==="loading") return null;
  if(state.status==="error") return path.startsWith("/rain/")?<p role="alert">This rain offer is unavailable.</p>:null;
  const offer=state.data;
  if(!offer) return null;
  const choose=async(choice:"accept"|"decline")=>{
    setBusy(true);setProblem("");
    try{setData(await api.post<Offer>(path+"/"+choice,{},"none"));}
    catch(error){setProblem(error instanceof Error?error.message:"Unable to update the offer.");}
    finally{setBusy(false);}
  };
  return <section className="rb-card"><h2>Rain plan · {offer.restaurant}</h2>
    {offer.status==="offered"?<><p>Rain expected at {offer.rain_at} ({offer.probability}%). Indoor table {offer.table} is held until {offer.expires.slice(11,16)}.</p>
    <p>Your time and party stay the same. Moving removes your previous chair request.</p>
    <Button busy={busy} onClick={()=>void choose("accept")}>Move me inside</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>void choose("decline")}>Keep my terrace table</Button></>:
    <p role="status">{offer.status==="accepted"?"You are booked at indoor table "+offer.table+".":offer.status==="declined"?"You are keeping the terrace table.":"This indoor table is no longer held."}</p>}
    {problem && <p role="alert">{problem}</p>}</section>;
}
export default function WeatherRainOffer(){
  const {token=""}=useParams();
  return <PageShell title="Rain plan" restaurantBrand><RainCard key={token} path={"/rain/"+encodeURIComponent(token)} /></PageShell>;
}
