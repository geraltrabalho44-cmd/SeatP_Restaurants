import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { names,type Locale } from "./locale";
import {useT} from "./I18nProvider";
import { Flag } from "./Flag";
// A small control: the flag of the language in use and its name; it opens a short list with a flag beside every
// language. It follows the listbox pattern: arrow keys move, Enter or Space choose, Escape closes. The choice is
// remembered and applies to every page of the site.
export function LanguagePicker(){
  const {locale,pick,options,t}=useT();
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLSpanElement>(null), button=useRef<HTMLButtonElement>(null), items=useRef<(HTMLLIElement|null)[]>([]);
  useEffect(()=>{
    if(!open) return;
    items.current[Math.max(0,options.indexOf(locale))]?.focus();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);};
    document.addEventListener("pointerdown",outside);
    return ()=>document.removeEventListener("pointerdown",outside);
  },[open]);// eslint-disable-line react-hooks/exhaustive-deps -- focus the chosen language only when the list opens
  if(options.length<2) return null;
  const close=()=>{setOpen(false);button.current?.focus();};
  const choose=(code:Locale)=>{pick(code);close();};
  const move=(event:KeyboardEvent<HTMLLIElement>,index:number)=>{
    const last=options.length-1;
    if(event.key==="ArrowDown"||event.key==="ArrowUp"||event.key==="Home"||event.key==="End"){
      event.preventDefault();
      const next=event.key==="Home"?0:event.key==="End"?last:event.key==="ArrowDown"?Math.min(last,index+1):Math.max(0,index-1);
      items.current[next]?.focus();
    } else if(event.key==="Enter"||event.key===" "){event.preventDefault();choose(options[index]);}
    else if(event.key==="Escape"){event.preventDefault();close();}
    else if(event.key==="Tab") setOpen(false);
  };
  return <span className="lang-picker" ref={root}>
    <button ref={button} type="button" className="lang-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t("Language")}: ${names[locale]}`}
      onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==="ArrowDown"&&!open){event.preventDefault();setOpen(true);}}}>
      <Flag locale={locale} /><span lang={locale}>{names[locale]}</span>
      <svg className="lang-chevron" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true" focusable="false"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open&&<ul className="lang-menu" role="listbox" aria-label={t("Language")}>
      {options.map((code,index)=><li key={code} ref={node=>{items.current[index]=node;}} role="option" lang={code} tabIndex={-1} aria-selected={code===locale}
        onClick={()=>choose(code)} onKeyDown={event=>move(event,index)}><Flag locale={code} /><span>{names[code]}</span></li>)}
    </ul>}
  </span>;
}
