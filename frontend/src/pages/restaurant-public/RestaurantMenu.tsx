import { useT } from "../../i18n/I18nProvider";
import { getPublicMenu } from "../../api/menus";
import { Button } from "../../design/components";
import { useLoad } from "../restaurant/useLoad";

export function RestaurantMenu({ slug }: { slug: string }) {
  const {t,tag,locale} = useT();
  const { state, reload } = useLoad(() => getPublicMenu(slug), slug);
  const currency = new Intl.NumberFormat(locale==="en"?"pt-PT":tag, { style: "currency", currency: "EUR" });
  return <section className="rb-card" aria-labelledby="restaurant-menu-title">
    <h2 id="restaurant-menu-title">{t("Menu and prices")}</h2>
    {state.status === "loading" && <p role="status">{t("Loading menu…")}</p>}
    {state.status === "error" && <p>{t("Could not load the menu.")} <Button variant="ghost" onClick={() => reload()}>{t("Try again")}</Button></p>}
    {state.status === "ready" && (state.data.items.length === 0 ? <p>{t("The restaurant has not added a menu yet.")}</p> : <>
      <div className="rp-menu">
        {[...new Set(state.data.items.map(item => item.category))].map(category => <section key={category} className="rp-menu-section"><h3>{category}</h3>
          <dl>{state.data.items.filter(item => item.category === category).map((item, index) => <div key={`${item.name}:${index}`} className="rp-menu-item">
            <dt><strong>{item.name}</strong><span className="rp-menu-dots" aria-hidden="true" /><span className="rp-menu-price">{currency.format(item.price_cents / 100)}</span></dt>
            {item.description && <dd>{item.description}</dd>}
            {item.allergens && <dd className="rp-menu-allergens">{t("Allergens:")} {item.allergens}</dd>}
          </div>)}</dl>
        </section>)}
      </div>
    </>)}
  </section>;
}
