import { catalogue, type Message } from "./catalogue";
export const names={en:"English",pt:"Português",es:"Español",fr:"Français"} as const;
export type Locale=keyof typeof names;
export const tags={en:"en-GB",pt:"pt-PT",es:"es-ES",fr:"fr-FR"} as const;
export function released(setting:string):Locale[] {
  return (Object.keys(names) as Locale[]).filter(key=>key==="en" || setting.split(",").some(word=>word.trim()===key));
}
export function detect(query:string|null,saved:string|null,languages:readonly string[],enabled:Locale[]):Locale {
  for(const input of [query,saved,...languages]) {
    const base=input?.toLowerCase().split("-")[0] as Locale;
    if(enabled.includes(base)) return base;
  }
  return "en";
}
export function translate(locale:Locale,key:Message,params:Record<string,string|number>={}):string {
  const index=({pt:0,es:1,fr:2} as const)[locale as Exclude<Locale,"en">];
  const text=locale==="en" || !Object.hasOwn(catalogue,key)? key:catalogue[key][index];
  return text.replace(/\{(\w+)\}/g,(match,name:string)=>Object.hasOwn(params,name)?String(params[name]):match);
}
