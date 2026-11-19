import type { Message } from "./catalogue";

// The sentences of the other languages are a separate chunk: someone using English never downloads them.
// loadCatalogue() fetches it (the language picker and the provider do that when a language other than English
// is on); until it has arrived, every sentence reads in English, which is always correct.
type Sentences = Readonly<Record<string, readonly [string, string, string]>>;
let loaded: Sentences | null = null;
export function setCatalogue(value: Sentences): void {
  loaded = value;
}
export async function loadCatalogue(): Promise<void> {
  if (!loaded) loaded = (await import("./catalogue")).catalogue;
}
/** Whether a sentence has translations (false until the catalogue has loaded). */
export function hasMessage(key: string): boolean {
  return loaded !== null && Object.hasOwn(loaded, key);
}
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
// The language of the page right now. The provider sets it while rendering, so plain functions (dates, money,
// form checks) can speak it without being handed it. A component that shows their words calls useT(), which
// is what makes it draw again when the language is changed.
let active: Locale = "en";
export function setActiveLocale(locale: Locale): void {
  active = locale;
}
export function activeLocale(): Locale {
  return active;
}
/** The Intl tag of the language in use: en-GB, pt-PT, es-ES or fr-FR. */
export function activeTag(): string {
  return tags[active];
}
/** Translates in the language in use, for code that is not a component. */
export function tr(key: Message, params: Record<string, string | number> = {}): string {
  return translate(active, key, params);
}

export function translate(locale:Locale,key:Message,params:Record<string,string|number>={}):string {
  const index=({pt:0,es:1,fr:2} as const)[locale as Exclude<Locale,"en">];
  const text=locale==="en" || loaded===null || !Object.hasOwn(loaded,key)? key:loaded[key][index];
  return text.replace(/\{(\w+)\}/g,(match,name:string)=>Object.hasOwn(params,name)?String(params[name]):match);
}
