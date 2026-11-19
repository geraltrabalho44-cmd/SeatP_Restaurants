import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {useLocation,useNavigate} from "react-router-dom";
import {catalogue,type Message} from "./catalogue";
import {detect,released,setActiveLocale,tags,translate,type Locale} from "./locale";

const key="seatplan:lang";
const enabled=released(import.meta.env.VITE_I18N_LOCALES ?? "en");
const Context=createContext<{locale:Locale;pick:(value:Locale)=>void;options:Locale[]}>({locale:"en",pick:()=>{},options:["en"]});
export function I18nProvider({children}:{children:ReactNode}) {
  const {pathname,search,hash,state}=useLocation();
  const navigate=useNavigate();
  const [saved,setSaved]=useState<string|null>(()=>{try{return localStorage.getItem(key);}catch{return null;}});
  const restaurant=pathname==="/" || /^\/(restaurants|r|b|owner|staff|pay|m)(\/|$)/.test(pathname);
  const query=new URLSearchParams(search).get("lang");
  const locale=restaurant?detect(query,saved,navigator.languages,enabled):"en";
  setActiveLocale(locale);
  function pick(value:Locale) {
    if(!enabled.includes(value)) return;
    setSaved(value);try{localStorage.setItem(key,value);}catch{/* In-memory preference. */}
  }
  useEffect(()=>{
    document.documentElement.lang=locale==="pt"?"pt-PT":locale;
    const requested = query?.toLowerCase().split("-")[0] as Locale | undefined;
    if(restaurant && requested && enabled.includes(requested)){
      pick(requested);
      const params=new URLSearchParams(search);
      params.delete("lang");
      navigate({pathname,search:params.toString(),hash},{replace:true,state});
    }
  },[locale,restaurant,query,search,pathname,hash,navigate,state]);
  return <Context.Provider value={{locale,pick,options:enabled}}>{children}</Context.Provider>;
}
export function useT(){
  const ctx=useContext(Context);
  const t=(msg:Message,params?:Record<string,string|number>)=>translate(ctx.locale,msg,params);
  const label=(value:string)=>Object.hasOwn(catalogue,value)?t(value as Message):value;
  return {...ctx,t,label,tag:tags[ctx.locale]};
}
