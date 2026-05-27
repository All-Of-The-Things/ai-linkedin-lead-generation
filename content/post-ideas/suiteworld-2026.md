# SuiteWorld 2026 — LinkedIn Post Drafts

Five posts to publish manually between June and October 2026. Each builds AOTT visibility in the NetSuite community ahead of SuiteWorld (Oct 25–28, Las Vegas).

Review each draft. Edit freely. Publish from your personal LinkedIn profile.

---

## Post 1 — ERP + Commerce Integration
**Suggested window**: June 2026
**Focus**: What breaks when NetSuite and Shopify (or SuiteCommerce) aren't properly connected — and what fixing it actually looks like.

---

Most NetSuite + Shopify implementations have the same three failure points.

Not because the platforms don't work together — they do. But because the integration was scoped to the minimum viable connection, not to how the business actually runs.

The ones we see most often:

**1. Inventory that lies.**
Shopify shows stock levels that are 4–6 hours behind NetSuite. Fine until a customer buys a product you've already committed elsewhere. Then it's a customer service problem, a refund, and a conversation about trust.

**2. Orders that arrive incomplete.**
The order hits NetSuite but the shipping method, discount, or gift note didn't make the trip. Someone manually corrects it. Every day. And nobody notices until the person who was doing the corrections leaves.

**3. Pricing that doesn't follow the rules.**
NetSuite has a price level structure. Shopify has its own discount logic. Nobody mapped them properly. So B2B customers on the Shopify storefront don't see their negotiated pricing, and ops handles the difference manually.

The fix isn't exotic. It's a properly scoped integration: field-level mapping done deliberately, error handling that surfaces problems instead of silently swallowing them, and a sync frequency that matches your order volume.

What's the failure point that keeps showing up in yours?

---

## Post 2 — SuiteCommerce
**Suggested window**: July 2026
**Focus**: What a well-built SuiteCommerce store actually looks like — and why most default implementations fall short.

---

SuiteCommerce has a reputation problem it doesn't deserve.

Most of the time, when someone says "SuiteCommerce is clunky" or "SuiteCommerce can't do that," they're describing the base installation — not the platform's ceiling.

Here's what most SuiteCommerce stores ship with: the standard theme, standard faceted navigation, standard checkout, and a performance profile that hasn't been tuned for their catalogue size. That works fine for a small B2B store. It doesn't work well for a 5,000-SKU DTC site with a complex pricing structure.

What a properly built SuiteCommerce store actually has:

A custom theme that matches the brand — not just CSS overrides on the default, but a structured component approach that makes future changes easier, not harder. Performance that doesn't fall apart when a product page needs to load 20 variants, three price levels, and real-time stock. A checkout that handles the actual edge cases: B2B payment terms, guest vs. registered pricing, address validation that doesn't frustrate international customers.

And critically: a data layer that lets marketing actually instrument the storefront. GA4, server-side events, the attribution setup that makes your ad spend legible.

None of that requires a different platform. It requires building SuiteCommerce properly.

If you're evaluating a replatform because your SuiteCommerce store is painful, worth understanding what's actually causing the pain first.

---

## Post 3 — Integrations
**Suggested window**: August 2026
**Focus**: When to buy a connector vs. build one — a practitioner's view from the NetSuite/Shopify ecosystem.

---

"Can't we just use a connector for that?"

Sometimes yes. Sometimes the connector is going to cost you more than a custom build by the time you're done configuring around its limitations.

Here's the actual question: does your integration fit the connector's data model, or does your business logic sit outside it?

A connector is the right call when:
- The data flow is standard (orders → NetSuite, inventory → Shopify, basic customer sync)
- Your order volume is predictable
- You can tolerate the sync frequency the connector supports
- The edge cases in your business don't require conditional logic

A custom build is the right call when:
- You have pricing rules, discount structures, or fulfilment logic that the connector doesn't map to
- You need error handling that surfaces the right information to the right team — not just a log file someone checks when something breaks
- You're running B2B and B2C on the same NetSuite instance with different rules for each channel
- The connector's sync latency is a problem for your operation (high-volume flash sales, inventory-critical fulfilment)

The failure mode we see: companies buy the connector, spend three months configuring workarounds, and end up with something brittle and expensive to maintain. The connector was cheap. The workarounds weren't.

Not saying build everything custom. But the connector decision is worth 20 minutes of honest scoping before you commit.

What's the integration you've been trying to make work?

---

## Post 4 — AI-Assisted / Spec-Driven Development
**Suggested window**: September 2026
**Focus**: How Spec-Driven Development with Claude Code changed how AOTT scopes and delivers — and what that means for clients.

---

The part of software projects that reliably goes wrong isn't the build. It's the gap between what was specified and what was built.

We started using a Spec-Driven Development approach with Claude Code about a year ago. The workflow: write a detailed spec before writing a line of code. Not a requirements doc — an executable specification that describes behavior, edge cases, acceptance criteria, and data contracts. Claude Code then works from that spec, and the spec is the ground truth the entire team navigates from.

What changed:

**Scope drift went down significantly.** When the spec is detailed enough to be unambiguous, there's much less room for "I thought you meant..." conversations three weeks in. The spec is the answer to those conversations.

**Delivery got faster.** Not because AI writes code faster than humans — it does, but that's not the point. It's because the time spent on re-work, re-scoping, and re-clarification collapsed. The first week of a project used to be a lot of alignment. Now it's mostly execution.

**Clients can read the spec.** A properly written spec isn't a technical document — it's a functional description of what the product does. Non-technical stakeholders can review it, catch misunderstandings early, and approve scope without needing to read code.

We use this for SuiteCommerce builds, Shopify custom development, and NetSuite integration work. The model works the same way: spec first, build from the spec, review against the spec.

If you're evaluating a build partner for a NetSuite or commerce project, ask them how they handle scope definition. The answer tells you a lot about what the delivery will look like.

---

## Post 5 — SuiteWorld Meeting Invite
**Suggested window**: October 1–15, 2026
**Focus**: AOTT is going to SuiteWorld. Book a coffee in Vegas.

---

We're heading to SuiteWorld in Las Vegas later this month.

If you're in the NetSuite ecosystem — as a partner, SI, or a brand running NetSuite — and you want to talk about Shopify or SuiteCommerce, I'd genuinely like to find 20 minutes at the conference.

What we do: Shopify and SuiteCommerce development, implementation, and integrations. We work with NetSuite SIs as their eCommerce delivery arm, and directly with brands that need a build partner for their commerce layer.

Three conversations that tend to be worth having at SuiteWorld:

1. **For SIs and partners**: you're getting client requests for Shopify Plus or SuiteCommerce work that sits outside your core. We can be the delivery arm for those projects — you keep the relationship, we handle the build.

2. **For brands on NetSuite**: your SuiteCommerce store needs work (performance, custom functionality, better ERP sync) or you're evaluating a move to Shopify. We've done both.

3. **For anyone evaluating a NetSuite-to-Shopify migration or a Shopify-to-SuiteCommerce migration**: we can give you an honest read on what the project actually involves before you commit to a scope.

Not a sales pitch — just a conversation. If it's relevant, it's worth 20 minutes.

Drop a comment or send me a message if you want to find time in Vegas.

---

## Notes for publishing

- Posts 1–4: publish from your personal profile, not the company page. Personal posts get more reach in the NetSuite community.
- Post 5 (meeting invite): publish 2–3 weeks before the event. Republish or comment to bump it 3–4 days before you fly out.
- Space posts at least 7–10 days apart. Two posts in the same week to the same audience is noise.
- Add 3–5 relevant hashtags at the end of each post: `#NetSuite`, `#SuiteCommerce`, `#Shopify`, `#SuiteWorld`, `#eCommerce` — or omit entirely if you prefer a cleaner look.
- If a post performs well (comments, shares), reply to every comment within 12 hours. That's what extends reach.
