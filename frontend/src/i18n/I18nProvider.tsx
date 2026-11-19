import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {useLocation,useNavigate} from "react-router-dom";
import type {Message} from "./catalogue";
import {detect,hasMessage,loadCatalogue,released,setActiveLocale,tags,translate,type Locale} from "./locale";

const key="seatplan:lang";
const enabled=released(import.meta.env.VITE_I18N_LOCALES ?? "en");
const Context=createContext<{locale:Locale;pick:(value:Locale)=>void;options:Locale[]}>({locale:"en",pick:()=>{},options:["en"]});
export function I18nProvider({children}:{children:ReactNode}) {
  const {pathname,search,hash,state}=useLocation();
  const navigate=useNavigate();
  const [saved,setSaved]=useState<string|null>(()=>{try{return localStorage.getItem(key);}catch{return null;}});
  // The staff sign-in (/login?next=/staff/...) is a restaurant screen too; the organiser sign-in at /login is not.
  const staffSignIn=pathname==="/login" && /^\/(owner|staff)(\/|$)/.test(new URLSearchParams(search).get("next") ?? "");
  const restaurant=pathname==="/" || staffSignIn || /^\/(restaurants|r|b|owner|staff|pay|m)(\/|$)/.test(pathname);
  const query=new URLSearchParams(search).get("lang");
  const locale=restaurant?detect(query,saved,navigator.languages,enabled):"en";
  setActiveLocale(locale);
  // The other languages' sentences arrive as their own file; draw again once they are here.
  const [,loadedOnce]=useState(0);
  useEffect(()=>{
    if(locale==="en") return;
    let current=true;
    void loadCatalogue().then(()=>{if(current) loadedOnce(count=>count+1);});
    return ()=>{current=false;};
  },[locale]);
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
  const label=(value:string)=>hasMessage(value)?t(value as Message):value;
  return {...ctx,t,label,tag:tags[ctx.locale]};
}
