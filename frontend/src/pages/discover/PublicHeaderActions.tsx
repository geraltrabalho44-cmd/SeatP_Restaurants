import { useT } from "../../i18n/I18nProvider";
// The diner account stays visible in the public header. On phones the owner and
// event links sit behind Menu.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getGuestToken, getSessionToken } from "../../api/client";
import "./discover.css";
import { LanguagePicker } from "../../i18n/LanguagePicker";

export function PublicHeaderActions() {
  const {t} = useT();
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = (): void => { setOpen(false); button.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const outside = (event: PointerEvent): void => { if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const owners = getSessionToken() ? "/owner" : "/owner/sign-in";
  return (
    <nav ref={nav} className="site-nav" aria-label={t("Main")} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={button} type="button" className="btn btn-ghost site-nav-toggle" aria-expanded={open} aria-controls="site-nav-links" onClick={() => setOpen((v) => !v)}>{t("Menu")}</button>
      <div id="site-nav-links" className={`site-nav-links${open ? " is-open" : ""}`}>
        <LanguagePicker />
        <Link to={owners} className="btn btn-ghost" onClick={close}>{t("For restaurant owners")}</Link>
        <Link to="/demo" className="btn btn-ghost" onClick={close}>{t("Plan an event")}</Link>
      </div>
      <Link to="/restaurants/account" className="btn btn-primary site-nav-login" onClick={() => setOpen(false)}>
        {getGuestToken() ? t("My account") : t("Log in")}
      </Link>
    </nav>
  );
}
