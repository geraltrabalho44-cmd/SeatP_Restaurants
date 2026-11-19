import {beforeAll,expect,it} from "vitest";
import {detect,loadCatalogue,released,translate} from "./locale";
beforeAll(()=>loadCatalogue());
it("uses explicit, saved and browser locales in order",()=>{
 const all=released("en,pt,es,fr");
 expect(detect("es","fr",["pt-BR"],all)).toBe("es");
 expect(detect(null,null,["pt-BR"],all)).toBe("pt");
 expect(detect("fr","pt",["es"],released(""))).toBe("en");
});
it("translates parameters as text",()=>expect(translate("fr","{count} people",{count:4})).toBe("4 personnes"));
