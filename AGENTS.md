# Notes for coding agents

Read this before adding a new page or editing layout CSS. These are real
bugs that have already happened once — please don't reintroduce them.
For the payments + booking system, see `ARCHITECTURE.md`.

## Always test responsive at 3+ widths before committing

After any layout/CSS change, check the page at **mobile (~375px)**,
**tablet (~768px)**, and **wide desktop (~1920px)**. Most bugs on this
site have been "looks fine on the screen I built it on, broken
elsewhere." Don't trust a single viewport.

## Gotcha 1 — Don't kill `.container` centering

`.container` is the site-wide centered wrapper:

```css
.container {
  width: min(1360px, calc(100% - 1.8rem));
  margin: 0 auto;   /* the auto margins center it */
}
```

Many elements carry `.container` **plus** a layout class (e.g.
`class="service-detail-hero container"`). If your layout rule sets
`margin: 0` on that class, it overrides `.container`'s `margin: 0 auto`
and **pins the whole page to the left edge** with a big empty gap on the
right at desktop widths.

- ❌ `.service-detail-hero { margin: 0; }`
- ✅ `.service-detail-hero { margin: 0 auto; }` (or `margin-block: 0`)

If you need zero vertical margin, use `margin: 0 auto` or `margin-block: 0`
— never plain `margin: 0` on anything that also has `.container`.

## Gotcha 2 — Full-bleed / hero images: keep the container at the image ratio

The homepage hero carousel images are exactly **1672×941** and the
carousel container is set to `aspect-ratio: 1672 / 941` with
`object-fit: cover`. When the container keeps that ratio, the image fills
it with **no cropping**.

It broke once because a desktop media query forced the hero to
`height: 100%; aspect-ratio: auto` to match the sidebar's height — that
stretched the container to a different ratio, so `object-fit: cover`
cropped the image by a screen-dependent amount (fine on the dev's screen,
ugly on others).

Rules of thumb for any image that should show fully:
- Keep the container's `aspect-ratio` equal to the image's real ratio.
- Don't force `height: 100%` + `aspect-ratio: auto` on an image box just
  to match a neighbouring column — use `align-self: start` and let the
  other column match up instead.
- If an image genuinely must fill a variable-size box, prefer
  `object-fit: contain` (shows the whole image, may letterbox) over
  `cover` (crops) unless you're certain the ratios match.

## Images: use WebP, keep them small

The site once shipped **82MB of images** (photos saved as multi-MB PNGs),
making the homepage download ~42MB on first load — terrible for mobile,
SEO/Core Web Vitals, and Vercel bandwidth. It's now ~3MB total.

When adding or replacing images:
- **Use WebP** for photos and illustrations (`.webp`), not PNG/JPEG.
  WebP is ~10-20x smaller at the same visible quality and is supported by
  every modern browser. PNG is only appropriate for tiny icons that need
  it; prefer inline SVG for icons (most icons here are inline SVG).
- **Target < ~200KB per image.** A full-width hero can be a bit more; a
  small card image should be well under 100KB.
- Don't commit a raster image that isn't referenced anywhere. Dead image
  files are pure repo bloat.
- Quick local conversion (Python Pillow is available):
  `Image.open("x.png").convert("RGB").save("x.webp","WEBP",quality=82,method=6)`
  then update the reference and delete the original.
- Remember `<img>` elements inside a `display:none`/`hidden` section
  **still download** in most browsers — don't leave heavy images in
  hidden/dead markup.

## Adding a new service / info page

- Copy the structure of an existing page in the same family (e.g.
  `pharmacy-first/index.html`) so you inherit the responsive header,
  footer, and `.service-detail-*` classes that already behave well.
- The header cart icon should link to `../book.html` and read "Book"
  (not "Cart" / `href="#"`).
- If the page represents a bookable service, give its primary "Book ..."
  button `data-cal-link="albayatilabs/<cal.eu-event-slug>"` and
  `data-cal-config='{"layout":"month_view"}'`, and include the shared
  cal.eu modal script (copy it from any service page). The slug must
  match the event type slug in cal.eu exactly.
