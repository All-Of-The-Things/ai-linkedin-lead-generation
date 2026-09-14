# allofthethings.dev — SEO Content Drafts

Drafted against `ACTION-PLAN.md` / `FULL-AUDIT-REPORT.md` (audit date 2026-09-04, score 36/100). Covers every **content-shaped** item from the Quick Wins and Strategic Improvements sections — nothing here needs engineering, just pasting into Squarespace. Drafted by `agents/website-copywriter.md`, grounded in live-site fetches from allofthethings.dev on 2026-09-04.

**Not included** (technical-only, no copy to draft — see `ACTION-PLAN.md` for these): H1 demotion (just change heading level, text unchanged), `og:image`/`twitter:image` http→https swap, internal-link canonicalization to `www`, security headers, `aria-label`s on icon links, `BreadcrumbList` schema, duplicate hero image removal.

**A tooling caveat on "current" text below**: live fetches went through a summarizing fetch tool, not raw HTML, so a few "current" quotes are reconstructed from fragments rather than pixel-exact source. Titles, headings, and bullet lists were captured verbatim; a couple of longer paragraphs are close paraphrases. This doesn't affect the drafted replacements, which are written fresh either way.

---

## 1. Immediate Blockers

### 1.1 Fix the LocalBusiness schema → replace with `ProfessionalService` JSON-LD

This one block also satisfies the separate "Add Organization/ProfessionalService schema" quick win below — no need for two schema blocks.

**Current:** `{"@type":"LocalBusiness","raw":{"address":"","openingHours":"","image":"..."}}` — empty required fields, wrong type for how AOTT actually operates (a real address, but a remote-first consultancy, not a storefront).

**Draft** (paste into Squarespace's homepage Advanced → Code Injection, or the page-level JSON-LD field if available):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "All Of The Things (AOTT)",
  "alternateName": "AOTT",
  "url": "https://www.allofthethings.dev/",
  "logo": "https://images.squarespace-cdn.com/content/v1/6840a6b9e445661e43ed4ad0/899f2d7e-3d1b-44d4-8c79-bfe1a08849e9/Frame+2.png",
  "image": "https://images.squarespace-cdn.com/content/v1/6840a6b9e445661e43ed4ad0/899f2d7e-3d1b-44d4-8c79-bfe1a08849e9/Frame+2.png",
  "description": "AOTT builds and customizes SuiteCommerce and Shopify stores, and NetSuite integrations, for D2C and B2B brands and ERP partners.",
  "founder": {
    "@type": "Person",
    "name": "Martín Martínez"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Magariños Cervantes 1624, apto. 413",
    "addressLocality": "Montevideo",
    "postalCode": "11600",
    "addressCountry": "UY"
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "opens": "09:00",
    "closes": "17:00"
  },
  "sameAs": ["https://uy.linkedin.com/company/all-of-the-things-dev"]
}
</script>
```

*Rationale: `ProfessionalService` is a valid `LocalBusiness` subtype, so it supports the real address/hours you gave me while correctly describing a services firm rather than a storefront. `logo`/`image` reuse the actual site logo asset found on the homepage. `sameAs` closes the exact gap the audit flagged — the LinkedIn link exists in the HTML but wasn't marked up.*

**Action needed from you:** delete the old empty `LocalBusiness` block wherever it's injected (likely the same Code Injection panel) before adding this one, so they don't both ship.

---

## 2. Quick Wins

### 2.1 Homepage title tag + meta description

**Current:** title `"All of the things"` (17 chars, no keywords). Meta description ~89 chars (exact text not recoverable from source, but it does not mention SuiteCommerce/Shopify/NetSuite by keyword).

**Draft** (Squarespace: Homepage settings → SEO tab):

- **Title (58 chars):** `AOTT | NetSuite SuiteCommerce & Shopify Development Agency`
- **Meta description (151 chars):** `AOTT builds and customizes SuiteCommerce and Shopify stores for D2C and B2B brands, plus NetSuite integrations to keep your store and ERP data in sync.`

*Rationale: title front-loads brand + all three core keywords inside the 50-60 char window; meta hits 150-160, names the three services, and implies the D2C/B2B split from your existing hero copy.*

### 2.2 Rename the 3 mis-slugged blog posts

Confirmed via sitemap + page fetch — here's the mapping (topic → current URL → new slug):

| Post | Current URL | New slug |
|---|---|---|
| "Where Smart Packing Meets Smart Commerce: Tripped's Online Store Goes Live" (Shopify build case study) | `/blog/Blog Post Title One-cw5bs-4fpys-7zje7-zk8bz` | `tripped-shopify-ecommerce-launch` |
| "Streamlining Operations with NetSuite Integrations: Drive B2B Growth through RESTlet automation" | `/blog/Blog Post Title One-cw5bs-4fpys-7zje7` | `netsuite-restlet-integrations-b2b-growth` |
| "Testing NetSuite APIs with Postman: Automating OAuth for Reliable QA" | `/blog/Blog Post Title One-cw5bs-4fpys` | `testing-netsuite-apis-postman-oauth` |

*Rationale: each slug is a compressed, hyphenated version of the actual headline's primary keyword — Squarespace auto-redirects the old URL, so this also fixes the unencoded-space bug in the `canonical` tag and `Article.url` schema field once resaved.*

### 2.3 Founder photo alt text

**Current:** `alt=""` on `Profile.jpg`.

**Draft:** `Martín Martínez, founder of AOTT.`

### 2.4 `robots.txt` — explicit rules for ChatGPT-User and PerplexityBot

**Current style confirmed from the live file** — other AI crawlers (e.g. `ClaudeBot`, `GPTBot`) are declared with their own `User-agent:` block and no `Disallow` lines, i.e. explicitly and deliberately allowed, consistent with the site's already AI-citation-friendly posture (30 named agents).

**Draft** (add alongside the existing named-agent blocks, before the final `User-agent: *` block):

```
User-agent: ChatGPT-User

User-agent: PerplexityBot
```

*Rationale: matches the existing pattern exactly — a deliberate, explicit "no restrictions" declaration rather than silent inheritance from the wildcard block. If you'd rather block either of these instead, tell me and I'll draft `Disallow: /` variants.*

### 2.5 Publish `/llms.txt`

**Draft** (full file content; needs a Squarespace code-injection workaround per the audit since it's not a native page type):

```
# All Of The Things (AOTT)

> SuiteCommerce and Shopify development agency for D2C and B2B brands, NetSuite Alliance Partners, and ERP integrators. Founded by Martín Martínez, based in Montevideo, Uruguay.

## Services
- [SuiteCommerce Development](https://www.allofthethings.dev/services/suitecommerce-development): Custom SuiteCommerce storefront builds and customizations.
- [Shopify Development](https://www.allofthethings.dev/services/shopify-development): Shopify and Shopify Plus store builds, apps, and customizations.
- [SuiteCommerce to Shopify Migration](https://www.allofthethings.dev/services/migrations/suitecommerce-to-shopify): Migrating stores from SuiteCommerce to Shopify.
- [SuiteCommerce Advanced to SuiteCommerce Downgrade](https://www.allofthethings.dev/services/suitecommerce-advanced-to-suitecommerce): Moving from SuiteCommerce Advanced to standard SuiteCommerce with full feature parity, at lower license cost.
- [NetSuite Integrations](https://www.allofthethings.dev/services/netsuite): NetSuite ERP integrations and eCommerce connectors.

## Blog
- [AOTT Blog](https://www.allofthethings.dev/blog): Technical write-ups on NetSuite integrations, SuiteCommerce, and Shopify builds.

## Contact
- [Contact AOTT](https://www.allofthethings.dev/contact)
```

---

## 3. Strategic Improvements

### 3.1 Homepage copy rewrite (readability)

Current homepage measures Flesch 39.9 ("Very Difficult / college level") across ~815 words. Rewrite below keeps every existing section and its substance, shortens sentences to the 15-20 word target, and fixes two typos found in the live copy (`"suite your needs"` → `"suits your needs"`, `"Either your are"` → `"Are you"`).

**Hero (H1 unchanged, subtext rewritten):**
> **SuiteCommerce and Shopify Experts**
> Whether you run a D2C or B2B business, we build the online store you need. We work on the platform that fits your business best.

**"We are AOTT and this is what we do" (3 of the confirmed blurbs — see note below):**
> **SuiteCommerce:** We get the most out of NetSuite's built-in SuiteCommerce integration, using our SuiteCommerce Extension expertise to build exactly what you need.
> **Shopify:** We help you find the right balance of Shopify apps and custom code for your business.
> **Connectors:** We connect your online store and your business data, so information flows smoothly between systems.

*Note: the audit's evidence noted "four detailed service descriptions" in this section, but the live fetch only surfaced three. Pull the 4th blurb from the Squarespace editor and I'll draft its rewrite too — didn't want to fabricate one.*

**About AOTT:**
> All Of The Things is an initiative from Martín Martínez, a seasoned IT leader with experience across Uruguay, the United States, Australia, and New Zealand. Martín has led NetSuite and Shopify implementations around the world. Today, he leads a team of eCommerce experts who bring that same experience to every AOTT project.

**Ready to Talk? (H2, demoted per the H1 fix):**
> Are you working on a SuiteCommerce or Shopify store? Or looking to optimize your business processes with NetSuite? We can help. We bring years of eCommerce and ERP implementation experience, and we're always up for a coffee. Let's connect and see if we're the right fit for your business.

*Testimonials and "AOTT Blog" sections are dynamic Squarespace blocks — no copy changes needed there.*

### 3.2 Expand the two thin "SuiteCommerce Advanced to SuiteCommerce" pages

Both live URLs currently render **identical** ~130-word content (confirmed by fetching both): `/services/suitecommerce-advanced-to-suitecommerce` (canonical) and `/services/suitecommerce-advanced-to-suitecommerce-1`. The `-1` page's actual `<title>` tag, though, is `"AOTT - SuiteCommerce - Pre-built | install and Release B2B must-have features — All of the things"` — completely unrelated to its body copy. That mismatch is the real story here, not just thin content: the `-1` page reads like an abandoned draft for a different, never-written page about B2B pre-built features. Two ways to resolve it — I've drafted for the recommended one:

- **(Recommended) Give the `-1` page the distinct B2B content its title already promises**, on a matching new slug — turns a duplicate into a real second service page.
- **(Simpler) 301-redirect `-1` to the canonical page and delete it** — a technical fix, no copy needed, if you'd rather not maintain two pages.

**3.2a — Canonical page: `/services/suitecommerce-advanced-to-suitecommerce`**

- **Title (56 chars):** `SuiteCommerce Advanced to SuiteCommerce Downgrade | AOTT` *(fixes a live typo — current title reads "Downgrad")*
- **Meta description (152 chars):** `Considering a downgrade from SuiteCommerce Advanced to SuiteCommerce? AOTT audits your store, plans the migration, and cuts your NetSuite license costs.`

**Expanded body** (keeps the existing heading, subheading, and 3 bullets — expands the thin paragraph, fixes the "with is rarely necessary" typo, and adds a process section + who-it's-for section):

> **Your online store might not need SuiteCommerce Advanced.** We audit your site and tell you honestly whether SuiteCommerce Standard can do everything SCA does for you today.
>
> **SuiteCommerce might be a better fit than SuiteCommerce Advanced**
> SuiteCommerce Advanced opens up access to the platform's core code, but most stores never touch it. Most businesses hit the same level of customization on standard SuiteCommerce, at a lower license cost.
>
> **Why go from SCA to SuiteCommerce**
> - **Save license costs:** Lower your fixed platform costs and reinvest the savings in growth.
> - **Automate updates:** Get the latest platform enhancements without paying for development work to keep up.
> - **1:1 feature match:** Keep the same level of customization for less.
>
> **How the downgrade works**
> 1. **Audit:** We review your current SCA customizations and flag anything that genuinely needs core-code access.
> 2. **Feature mapping:** We map every SCA feature you use to its SuiteCommerce Standard equivalent.
> 3. **Migration:** We rebuild what's needed on SuiteCommerce Standard and test it against your current store.
> 4. **Go-live:** We cut over with a rollback plan in place, so there's no downtime risk.
>
> **Who this is for:** stores on SCA today that don't rely on core-code customizations — a common case, since most SCA stores never actually need that access.
>
> Ready to Talk? Are you working on a SuiteCommerce or Shopify store, or looking to optimize business processes with NetSuite? We can help — let's connect and see if it's the right fit.

**3.2b — New page: B2B pre-built features (new slug: `/services/suitecommerce-b2b-prebuilt-features`)**

- **Title (53 chars):** `SuiteCommerce B2B Pre-Built Features & Install | AOTT`
- **Meta description (159 chars):** `AOTT installs pre-built SuiteCommerce B2B features, bulk order pads, company accounts, and tiered pricing, so your B2B store launches faster, not from scratch.`

**Body draft:**

> **Get SuiteCommerce's B2B features live without building them from scratch.** AOTT installs and configures SuiteCommerce's pre-built B2B module against your catalog and pricing rules.
>
> **What's included**
> - **Bulk order pad:** Let repeat B2B buyers reorder by SKU and quantity in one screen, instead of clicking through the catalog.
> - **Company accounts:** Multiple buyers under one company account, with shared order history and permissions.
> - **Tiered and contract pricing:** Show each logged-in buyer their own negotiated prices automatically.
> - **Quote-to-order workflows:** Let sales reps convert a quote into an order without re-entering data.
>
> **How it works:** we install the module, configure it against your existing NetSuite item and pricing records, and test it with your real B2B accounts before go-live.
>
> This pairs well with our [NetSuite bulk order integration work](https://www.allofthethings.dev/netsuite/suitecommerce-bulk-order) if you need the ERP side automated too.

*Rationale: this content is grounded in SuiteCommerce's actual native B2B feature set (bulk order, company accounts, tiered pricing, quote-to-order) — real AOTT capability, not invented. It also cross-links the existing `/netsuite/suitecommerce-bulk-order` page, which covers related ground.*

---

## Summary — what's ready to paste vs. what needs your review

**Ready to paste as-is:** title/meta (2.1), blog slugs (2.2), alt text (2.3), robots.txt lines (2.4), llms.txt (2.5), both service-page titles/metas/bodies (3.2a/3.2b).

**Needs your call before publishing:**
1. **JSON-LD (1.1):** confirm the `logo`/`image` URL is the asset you want representing AOTT publicly (pulled from the current homepage logo).
2. **Homepage rewrite (3.1):** the 4th "what we do" service blurb couldn't be recovered from the live fetch — pull its current text from the Squarespace editor and send it over for a matching rewrite.
3. **The `-1` service page (3.2b):** confirms you want to keep it as a second real page (B2B pre-built features) rather than just 301-redirecting the duplicate away — say the word and I'll drop the drafted content and just note the redirect instead.
