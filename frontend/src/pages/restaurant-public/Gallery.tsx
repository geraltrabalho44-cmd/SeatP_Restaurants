import { useT } from "../../i18n/I18nProvider";
// The photos of the public page: a large cover and thumbnails. Tapping one opens
// a full-screen view with arrows, swipe, and Esc to close (the Dialog handles
// Esc, focus and returning focus). Every photo has its alt text.
import { useEffect, useRef, useState } from "react";
import type { PublicPhoto } from "../../api/discovery";
import { Button, Dialog } from "../../design/components";
import { PhotoImg } from "./PhotoImg";

/** The cover first, then the rest in the owner's order. */
export function coverFirst(photos: PublicPhoto[]): PublicPhoto[] {
  const cover = photos.findIndex((p) => p.is_cover);
  return cover <= 0 ? photos : [photos[cover], ...photos.filter((_, i) => i !== cover)];
}

export function GalleryCredits({ photos }: { photos: PublicPhoto[] }) {
  const {t} = useT();
  const credited = photos.filter(photo => photo.credit);
  if (credited.length === 0) return null;
  return (
    <section className="rp-photo-credits" aria-label={t("Photo credits")}>
      {credited.map(({ credit, url, alt }) => credit && <p key={url}>{t("Photo credit:")} <a href={credit.file}>{alt || t("Source image")}</a> {t("by")} {credit.author}
        {" · "}<a href={credit.license_url}>{credit.license}</a>
      </p>)}
    </section>
  );
}

export function Gallery({ photos, name, preview = false }: { photos: PublicPhoto[]; name: string; preview?: boolean }) {
  const {t} = useT();
  const ordered = coverFirst(photos);
  const [open, setOpen] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);

  const step = (by: number): void => setOpen((i) => (i === null ? i : (i + by + ordered.length) % ordered.length));
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // step only uses setOpen and the photo count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ordered.length]);

  if (ordered.length === 0) {
    return (
      <div className="rp-gallery rp-gallery-empty">
        <p className="rb-muted">{t("{name} has not added photos yet.", {name})}</p>
      </div>
    );
  }
  const current = open === null ? null : ordered[open];
  return (
    <div className="rp-gallery">
      <button type="button" className="rp-cover" onClick={() => setOpen(0)} aria-label={t("Open photo {n} of {total}: {alt}", {n:1,total:ordered.length,alt:ordered[0].alt || name})}>
        <PhotoImg url={ordered[0].url} alt={ordered[0].alt} preview={preview} />
      </button>
      {ordered.length > 1 && (
        <ul className="rp-thumbs" aria-label={t("More photos")}>
          {ordered.slice(1).map((photo, index) => (
            <li key={photo.url}>
              <button type="button" onClick={() => setOpen(index + 1)} aria-label={t("Open photo {n} of {total}: {alt}", {n:index+2,total:ordered.length,alt:photo.alt || name})}>
                <PhotoImg url={photo.url} alt={photo.alt} preview={preview} lazy />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={current !== null}
        title={t("Photos of {name}", {name})}
        onClose={() => setOpen(null)}
        actions={
          ordered.length > 1 ? (
            <>
              <Button variant="secondary" onClick={() => step(-1)}>{t("Previous")}</Button>
              <Button variant="secondary" onClick={() => step(1)}>{t("Next")}</Button>
              <Button onClick={() => setOpen(null)}>{t("Close")}</Button>
            </>
          ) : (
            <Button onClick={() => setOpen(null)}>{t("Close")}</Button>
          )
        }
      >
        {current && (
          <figure
            className="rp-lightbox"
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const from = touchStart.current;
              const to = event.changedTouches[0]?.clientX;
              touchStart.current = null;
              if (from !== null && to !== undefined && Math.abs(to - from) > 50) step(to < from ? 1 : -1);
            }}
          >
            <PhotoImg url={current.url} alt={current.alt} preview={preview} />
            <figcaption role="status">
              {t("Photo {n} of {total}", {n:(open ?? 0)+1,total:ordered.length})}
              {current.alt ? `: ${current.alt}` : ""}
            </figcaption>
          </figure>
        )}
      </Dialog>
    </div>
  );
}
