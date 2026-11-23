import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { getOwnerMenu, saveOwnerMenu } from "../../api/menus";
import type { MenuItem, RestaurantMenu } from "../../api/menus";
import { getOwnerProfile } from "../../api/owner";
import { Button, Checkbox, ErrorState, Field, Skeleton, useToast } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { euroCents } from "./menuPrice";
import { OwnerShell } from "./OwnerShell";

export default function MenuPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(async () => {
    const [profile, menu] = await Promise.all([getOwnerProfile(venueId), getOwnerMenu(venueId)]);
    return { profile, menu };
  }, venueId);
  return <OwnerShell title={t("Menu and prices")} venueId={venueId} current="menu" venueName={state.status === "ready" ? state.data.profile.name : undefined}>
    <h1>{t("Menu and prices")}</h1>
    <p>{t("Add dishes with their prices in euros. Available dishes appear on your public page.")}</p>
    {state.status === "loading" && <Skeleton lines={4} label={t("Loading menu")} />}
    {state.status === "error" && <ErrorState title={t("Could not load menu")} message={errorMessage(state.error)} onRetry={reload} />}
    {state.status === "ready" && <MenuEditor key={venueId} venueId={venueId} initial={state.data.menu} onReload={reload} />}
  </OwnerShell>;
}

type DraftItem = MenuItem & { price: string; key: number };
function MenuEditor({ venueId, initial, onReload }: { venueId: string; initial: RestaurantMenu; onReload: () => void }) {
  const { t } = useT();
  const [version, setVersion] = useState(initial.version);
  const [items, setItems] = useState<DraftItem[]>(() => initial.items.map((item, key) => ({ ...item, key, price: (item.price_cents / 100).toFixed(2) })));
  const [nextKey, setNextKey] = useState(items.length);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const toast = useToast();
  const change = (index: number, fields: Partial<DraftItem>) => setItems(items.map((item, i) => i === index ? { ...item, ...fields } : item));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (items.some(item => euroCents(item.price) === null)) { setProblem(t("Use a valid euro price with up to two decimals, for example 12,50.")); return; }
    setBusy(true);
    setProblem(null);
    try {
      const menu = await saveOwnerMenu(venueId, { version, items: items.map(({ key: _key, price, ...item }) => ({ ...item, price_cents: euroCents(price)! })) });
      setVersion(menu.version);
      toast.show(t("Menu saved."), "success");
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const initialCount = initial.items.length;
  // Each dish is one closed line (name, category and price) that opens to edit it, so a long menu stays short on a phone.
  // A dish added now starts open. If the browser stops the save on an empty required field, that dish opens first.
  return <form onSubmit={event => void save(event)} onInvalidCapture={event => (event.target as HTMLElement).closest("details")?.setAttribute("open", "")}>
    <fieldset disabled={busy} className="ow-dishes">
      {items.map((item, index) => <details key={item.key} className="rb-card ow-dish" open={item.key >= initialCount || undefined}>
        <summary>
          <span className="ow-dish-name">{item.name.trim() || t("New dish")}</span>
          <span className="ow-dish-meta">{item.category}{item.price ? ` · ${item.price.replace(".", ",")} €` : ""}{!item.available && <> · <em>{t("Hidden from the menu")}</em></>}</span>
        </summary>
        <fieldset className="ow-dish-fields">
          <legend className="visually-hidden">{t("Dish {n}", { n: index + 1 })}</legend>
          <Field label={t("Dish name")} required maxLength={120} value={item.name} onChange={event => change(index, { name: event.target.value })} />
          <Field label={t("Category")} required maxLength={60} value={item.category} onChange={event => change(index, { category: event.target.value })} />
          <Field label={t("Description")} maxLength={500} value={item.description} onChange={event => change(index, { description: event.target.value })} />
          <Field label={t("Price (€)")} required inputMode="decimal" value={item.price} onChange={event => change(index, { price: event.target.value })} />
          <Field label={t("Allergens")} maxLength={500} value={item.allergens} onChange={event => change(index, { allergens: event.target.value })} />
          <Checkbox label={t("Available on the public menu")} checked={item.available} onChange={event => change(index, { available: event.target.checked })} />
          <Button variant="ghost" className="ow-dish-remove" onClick={() => setItems(items.filter((_, i) => i !== index))}>{t("Remove dish {n}", { n: index + 1 })}</Button>
        </fieldset>
      </details>)}
      <Button variant="secondary" disabled={items.length >= 100} onClick={() => { setItems([...items, { key: nextKey, name: "", category: "Menu", description: "", price: "", price_cents: 0, allergens: "", available: true }]); setNextKey(nextKey + 1); }}>{t("Add dish")}</Button>
    </fieldset>
    {problem && <p role="alert">{problem} <Button variant="ghost" disabled={busy} onClick={onReload}>{t("Reload saved menu")}</Button></p>}
    <p><Button type="submit" busy={busy}>{t("Save menu")}</Button></p>
  </form>;
}
