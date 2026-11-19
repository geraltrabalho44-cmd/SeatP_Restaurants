import { names,type Locale } from "./locale";
import {useT} from "./I18nProvider";
export function LanguagePicker(){
  const {locale,pick,options,t}=useT();
  if(options.length<2) return null;
  return <select className="select-themed" aria-label={t("Language")} value={locale}
    onChange={e=>pick(e.target.value as Locale)}>{options.map(code=><option lang={code} key={code} value={code}>{names[code]}</option>)}</select>;
}
