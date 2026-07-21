# Strategic Review and Comprehensive Redesign Direction

## Review basis and evidence method

This review assesses hmhristov.com as a personal website with three equally important purposes: expressing a credible professional identity, presenting projects and useful experiments, and sharing creative work. It is intended both for the owner making strategic decisions and for a later implementation agent translating those decisions into a coherent static site.

Material observations use four labels. **Workspace-confirmed** means directly supported by the current repository and is authoritative for scope and behavior. **Live-observed** means visible on the deployed primary-navigation routes reviewed on 21 July 2026; deployment differences are evidence, not a correction to the workspace. **Source-inferred** means a reasonable implication of code or content that was not fully demonstrated in the live review. **Subjective judgment** identifies an evaluative design or strategy opinion. The live scope was Home, CV, Apps, My art, and the two learning tools linked by Apps. Other workspace utilities and the China gallery inform the portfolio strategy but were not treated as live-observed primary routes.

This is a WCAG 2.2 AA-informed review, not an accessibility audit or conformance claim. Browser/device lab testing, assistive-technology testing, and user research would still be needed before any formal claim.

## Executive assessment

**Workspace-confirmed:** The site contains real evidence of a long data-and-analytics career, two usable vocabulary applications, a GitHub Markdown reader, checklist and link utilities, thirteen digitized artworks, and a large multi-event China travel gallery. **Live-observed:** The deployed primary experience foregrounds a brief biography, a long chronological CV, two minimally described app links, and an image grid. **Subjective judgment:** The site therefore understates its owner. It behaves more like a personal filing cabinet than a deliberately edited portrait of a senior technology leader who also makes practical tools and sustained creative work.

The strongest comprehensive direction is a calm, editorial “professional studio” rather than a corporate résumé template or a decorative art portfolio. A shared visual and narrative system should connect three peer pillars—Leadership & Data, Projects & Utilities, and Art & Journeys—under one clear proposition: an experienced data leader who builds useful things and maintains a serious creative practice. Each pillar should have its own content rhythm while sharing navigation, typography, spacing, accessibility behavior, metadata, and trust signals.

**Subjective judgment:** The highest-return work is not a technology migration. It is selection, hierarchy, explanation, and consistency. The existing no-build static architecture is well suited to the site’s size and personal ownership. A modest shared CSS system, semantic HTML, small progressive JavaScript modules, optimized local media, and hand-maintained structured content can deliver the redesign without a framework, package manager, server, database, or build step.

The recommended sequence is: first establish message, navigation, accessibility baseline, privacy boundary, and shared design tokens; then reshape the homepage and three pillars; then deepen selected case studies and curate creative collections; finally refine search, sharing, performance, and optional enhancements. This order prevents isolated cosmetic changes from reinforcing the current fragmentation.

## Strategic positioning and audiences

**Workspace-confirmed:** The homepage states more than 25 years in data and analytics, progression from software and database engineering into architecture and global team leadership, and current interests spanning Azure, Power BI, Python, Scrum, HTML, and CSS. The CV contains concrete career progression but mostly duty-oriented bullets. **Live-observed:** The professional claim is readable, yet the generic title and description—“public web space” and “Web space of Hristo M. Hristov”—do not explain distinct expertise or intended value.

Three plausible audiences should be served without letting one erase the others:

1. Professional peers, hiring partners, conference collaborators, and people evaluating leadership or architecture experience need a fast, credible summary, selected outcomes, and a clear contact path.
2. Technically curious visitors need to understand what each project is, whom it helps, how mature it is, and what constraints or lessons make it interesting.
3. Friends, family, fellow makers, and culturally curious visitors need an inviting, curated path through art and travel work rather than an undifferentiated archive.

**Subjective judgment:** A useful positioning sentence should combine all three rather than enumerate technologies. Its structure could be: identity and seniority; the kind of change led; then a human counterpoint about making tools and visual work. The site should develop final wording through message testing, not adopt exhaustive replacement copy from this review.

**Major recommendation — establish one proposition and three peer pillars.** Problem: the current labels “CV,” “Apps,” and “My art” describe file types or ownership rather than visitor value. Importance: navigation is the site’s primary statement of identity. Expected benefit: faster orientation and equal legitimacy for professional, project, and creative work. Effort: low to medium, mainly editorial and information architecture. Trade-off: stronger curation means some material becomes secondary rather than equally visible. Redesign relationship: this proposition is the governing decision for the homepage, navigation, page introductions, metadata, and cross-links.

## Information architecture and navigation

**Workspace-confirmed:** Four root pages repeat a four-item menu independently. Apps exposes only the two word tools, while the repository also contains the Markdown reader, checklists, link reader, and China gallery. The China gallery has its own event navigation and visual system. **Live-observed:** Home, CV, Apps, and My art use the same labels, but there is no persistent explanation of the site’s larger structure, no visible current-page state in extracted content, and no route from the main navigation to several substantive works.

Use a shallow architecture: Home; Professional; Projects; Creative; About/Contact can be a homepage section or compact destination rather than another major silo. “Professional” should combine a concise career narrative, selected outcomes, capabilities, and an optional full chronology. “Projects” should be a portfolio index with clear maturity labels. “Creative” should introduce Art and Journeys as distinct collections. The existing URLs can remain or redirect conceptually through labels and links; URL stability matters more than perfectly tidy naming.

**Major recommendation — replace inventory navigation with visitor-oriented wayfinding.** Problem: content discovery depends on knowing the current filenames and categories. Importance: hidden work cannot contribute to reputation, utility, or creative connection. Expected benefit: more meaningful exploration and a stronger sense of a single site. Effort: medium. Trade-off: bringing private-feeling utilities into the public portfolio may require excluding or reframing some items. Redesign relationship: the new hierarchy is the skeleton onto which all three pillars attach.

**Source-inferred:** Repeated page-level menu markup makes drift likely because navigation changes must be copied manually. Without introducing a build step, consistency can still be governed through a documented canonical snippet and shared class system; a tiny optional client-side include is possible, but navigation should remain usable if JavaScript fails. **Subjective judgment:** For a small site, deliberate duplication is preferable to making core navigation JavaScript-dependent.

## Visual design and design system

**Workspace-confirmed:** Root pages use Arial at 14pt, a warm cream-and-brown palette, large left margins on headings, equal-width sticky menu cells, and few width constraints. Art images are forced to 400px height. Apps use beige cards with hover movement, while the two learning tools and other utilities each define separate visual rules. **Live-observed:** The root content is legible but visually sparse; professional, utility, and artwork presentations have little hierarchy beyond headings and raw content blocks.

**Subjective judgment:** The warm palette is a promising personal signature and should be refined rather than discarded. Use a restrained editorial system: warm paper background, dark ink text, one earthy accent, one quiet secondary surface, generous whitespace, and a type pairing that remains fast and resilient through system font stacks or carefully chosen self-hosted assets. Professional pages can emphasize structured text and evidence; project pages can use compact cards and interface imagery; creative pages can allow larger visual fields. Shared proportions, captions, navigation, and footer should keep them related.

Define a small token set for colors, text sizes, line lengths, spacing, borders, focus rings, and breakpoints in the existing shared stylesheet. Use a readable content measure around 60–75 characters, fluid type within conservative bounds, and image aspect-ratio handling that avoids cropping artworks without intent. Avoid ornamental dashboards, skill meters, stock illustrations, and excessive animation: they would weaken the site’s authentic, handmade character.

**Major recommendation — create one restrained, responsive visual language with pillar-specific compositions.** Problem: shared pages look unfinished while apps and galleries feel disconnected. Importance: visual coherence is interpreted as care and credibility. Expected benefit: a more memorable identity, better reading, and freedom for each content type without fragmentation. Effort: medium. Trade-off: systematization reduces some one-off styling freedom and requires checking every route. Redesign relationship: tokens and components are the reusable foundation, not a standalone reskin.

## Homepage and public messaging

**Workspace-confirmed:** The homepage leads with the name, portrait, third-person summary, interests list, exposed email address, LinkedIn, GitHub, and “Wisdom is the goal.” It does not preview projects or creative work. **Live-observed:** The summary establishes tenure and current leadership, but the page provides no proof-oriented highlights, featured work, recent activity, or invitation into the other pillars.

The redesigned homepage should work in layers. The first screen needs name, a precise one- or two-sentence proposition, portrait, and two or three obvious next actions. A compact credibility strip can summarize scale and domains without turning experience into vanity metrics. Three equally weighted feature blocks should then introduce professional leadership, selected projects, and creative practice. A final human note and controlled contact area can retain warmth.

**Subjective judgment:** Use first person consistently unless there is a deliberate reason for a formal biography. First person fits a personal domain, makes project decisions easier to explain, and bridges professional and creative voices. The motto may remain as a quiet closing signature, but it should not carry the messaging burden.

**Major recommendation — turn the homepage into a balanced editorial gateway.** Problem: it currently functions as an abbreviated résumé cover. Importance: many visitors will decide whether to continue within one screen. Expected benefit: all three purposes become visible, visitors self-select quickly, and the owner’s breadth feels intentional. Effort: medium. Trade-off: the page requires maintaining a small set of featured items and resisting summary overload. Redesign relationship: it is the clearest expression of the three-pillar strategy.

## Professional identity and CV presentation

**Workspace-confirmed:** The CV supplies a detailed chronology from 1999 onward, education, languages, skills, certifications, employer names, locations, and current-role statements. Several bullets describe meaningful transformations, team growth, operating models, architecture, and modernization. Some wording and spelling need editorial attention, and tables encode much of the layout. **Live-observed:** The deployed CV is long and comprehensive, but important outcomes compete visually with duties, technology lists, and early-career detail.

Reframe the professional pillar around a leadership narrative: what problems Hristo is trusted to solve, how technical depth informs leadership, and what patterns recur across transformations. Follow with three to five selected outcomes expressed with context, action, and impact where public disclosure permits. Then show capability themes such as data-platform strategy, delivery leadership, organization building, and hands-on architecture. Keep the full chronology as supporting evidence, progressively less detailed for older roles.

**Source-inferred:** Some work may be commercially sensitive; absence of public metrics should not be filled with invented precision. Use responsibly generalized scale (“global,” “multi-team,” “threefold team growth,” where already stated) and focus on decisions and outcomes that can be disclosed. Separate active certifications from historical ones and verify current status before implying currency.

**Major recommendation — convert the CV from a record of duties into an evidence-led career story.** Problem: valuable leadership signals are buried in chronological density. Importance: senior audiences assess scope, judgment, outcomes, and communication more than exhaustive technology recall. Expected benefit: stronger credibility and faster scanning while retaining detailed history. Effort: medium, driven by editing and fact verification. Trade-off: concise storytelling necessarily omits some experience; the full chronology should remain accessible. Redesign relationship: this gives the professional pillar the same curatorial quality recommended for projects and art.

## Projects and utilities portfolio

**Workspace-confirmed:** Apps lists two vocabulary games only. One has an inline bilingual dataset and three-choice interaction; the newer HH Words loads a large JSON dataset, tracks correct/wrong answers, removes mastered words from the session, and shows transcription and example sentences. The repository also has a configured GitHub Markdown reader, a CDN-dependent checklist renderer, link-reading code, and sophisticated gallery/editor tooling. **Source-inferred:** These works range from family-oriented personal tools to reusable utilities and substantial evolving systems; presenting all as equivalent “Applications” obscures their intent and maturity.

Adopt a visible taxonomy:

- **Completed project:** stable, intentionally presented work with a defined user and outcome.
- **Utility:** a focused tool that solves a recurring task.
- **Experiment:** exploratory work where learning matters more than polish or permanence.
- **Personal tool:** built for the owner, family, or a narrow context and shared as such.

Each project card should state category, one-line purpose, audience, status, and whether it opens an interactive tool or a case study. Selected items deserve short case studies: the problem, constraints, design decisions, what works, limitations, and lessons. Interface screenshots can set expectations and preserve evidence if an external dependency later fails. Public demos should have a clear way back to the portfolio and should not be mistaken for commercial products.

**Subjective judgment:** The learning tools are most compelling when framed honestly as iterative personal tools, showing how the second version extends learning feedback and dataset depth. The China gallery and local data editor together could form the strongest technical case study: static hosting, event registry, rich-media data, offline editing, visibility control, and graceful constraints. The case study can discuss the system without exposing the editor publicly in primary navigation.

**Major recommendation — replace the Apps link list with a maturity-labeled project portfolio.** Problem: visitors see names but cannot judge purpose, quality, ownership, or relevance. Importance: explanation turns small tools into evidence of product thinking and technical curiosity. Expected benefit: clearer expectations, stronger professional proof, and respectful framing of personal utilities. Effort: medium to high depending on case-study depth. Trade-off: candid status labels expose limitations, but that honesty increases trust. Redesign relationship: project taxonomy is the projects pillar’s equivalent of a professional capability model and a gallery’s curatorial scheme.

## Creative work and gallery direction

**Workspace-confirmed:** My art presents ten oil works and three watercolors as a sequence of same-height images with descriptive alt text. Two titles repeat. The China collection contains roughly forty-five event files with images, videos, text blocks, hash navigation, and Google Drive delivery. **Live-observed:** The art route exposes the media successfully in two misspelled category headings (“Oil” and “Watercollor”) but provides no introduction, dates beyond filenames, medium details, captions, enlargement behavior, or curatorial rationale.

Treat creative work as intentional practice, not decoration beside the CV. The Art landing view should use a selected set, preserve full works without arbitrary crops, and supply concise captions where known: title, year, medium, and an optional sentence of context. Collections could be Painting and Travel/Journeys, with the China journey introduced as a visual narrative. A smaller selection is likely more powerful than showing every available image at once; archives can remain reachable after the curated entry point.

For the China gallery, offer a short orientation, a manageable chapter structure, representative cover images, and context for place and sequence. Maintain static event data and hash-addressable routes. Google Drive can remain a media source, but meaningful fallback text, visible loading/error states, and representative local thumbnails would make the experience less dependent on a third party.

**Major recommendation — build a curated static gallery with collection-level storytelling.** Problem: raw grids and event inventories make creative effort hard to interpret. Importance: curation signals intent and gives viewers emotional and chronological entry points. Expected benefit: art receives equal stature, images are easier to appreciate, and travel material becomes a story rather than storage. Effort: medium for art, high for the travel archive. Trade-off: selection may feel exclusionary and metadata recovery takes time; preserve an archive view to balance completeness. Redesign relationship: curation is the common method across all pillars—selected outcomes, selected projects, selected works.

## User experience and interaction quality

**Workspace-confirmed:** Root navigation is sticky and uses wide equal cells; project tools lack shared site navigation. Apps cards use motion only on hover. The HH Words answers are clickable `div` elements even though a list role is present, and completion/error messages are appended into the page. The gallery uses dynamic scripts and a lightbox. **Source-inferred:** Keyboard, focus, history, and error experiences vary significantly across routes because each utility evolved independently.

Define common interaction rules: semantic links for destinations, buttons for actions, obvious current-page state, visible focus, generous touch targets, predictable Back behavior, and a shared return path from every public tool. Important state changes in quizzes should be announced without relying only on color. Destructive or resetting actions need clear consequences. Loading and failure should preserve the page frame and explain recovery.

**Major recommendation — establish a common interaction contract and progressive-enhancement baseline.** Problem: basic controls and recovery differ by page. Importance: predictable behavior supports accessibility, trust, and mobile use. Expected benefit: less user hesitation and fewer dead ends when scripts or external media fail. Effort: medium. Trade-off: retrofitting semantic controls may require adjusting event logic and visual styling. Redesign relationship: this is the behavioral layer of the shared design system.

## WCAG 2.2 AA-informed accessibility review

**Workspace-confirmed:** Root documents declare viewport metadata and artwork has non-empty alt text. The homepage portrait has no alt attribute, the HTML language is absent on several root pages, some markup is invalid (including repeated body tags and block elements inside paragraphs), and the CV relies on nested tables without evident headers. Root CSS defines hover effects but no explicit focus treatment or reduced-motion behavior. HH Words uses non-native interactive answer elements; feedback uses red/green styling alongside text. **Live-observed:** Text content and headings were extractable, but extraction alone cannot establish contrast, focus visibility, reflow, target size, or assistive-technology support.

The accessibility foundation should include semantic landmarks, one clear H1, logical headings, page language, meaningful titles, skip navigation, labeled native controls, informative alt text, decorative-image handling, table headers only where data tables remain, and DOM validity. Verify text and component contrast against AA targets, keyboard access at every step, focus order and visibility, 200% zoom, 320 CSS-pixel reflow, text spacing, target size, motion preferences, error identification, status announcements, and lightbox focus containment/return. Do not promise certification based on static inspection.

**Major recommendation — make accessibility acceptance criteria part of every shared component and template.** Problem: defects are structural and repeated, not isolated cosmetic issues. Importance: accessibility affects whether people can navigate, read, operate quizzes, and dismiss overlays. Expected benefit: broader access, better mobile/keyboard UX, more robust HTML, and easier future maintenance. Effort: medium to high, especially for interactive tools and galleries. Trade-off: native semantics may constrain some bespoke styling, and testing takes sustained attention. Redesign relationship: accessibility must be embedded in foundations before page-by-page polish.

## Privacy, contactability, and trust

**Workspace-confirmed:** The homepage publishes a personal Yahoo address in plain text, links professional social profiles, names employers, gives a city, and provides a decades-long education/employment history. Travel media is served from Google Drive. **Live-observed:** The plain email address is immediately visible and machine-readable. **Source-inferred:** Public professional history is intentional, but the combination of direct email, detailed chronology, and personal travel/family-adjacent material increases unwanted-contact and profiling exposure.

Preserve contactability with a professional-contact boundary: make LinkedIn the primary channel, optionally use a dedicated public alias, and reveal or obfuscate an email only in ways that remain accessible. Avoid client-side contact forms that imply secure delivery without a backend. Review CV dates, locations, travel captions, image metadata, identifiable bystanders, and family context against a “needed for the story?” test. Publish a short privacy note explaining that the site is static and identifying any third-party media or analytics services.

**Major recommendation — reduce exposed personal detail while keeping a credible route to contact.** Problem: current openness exceeds what most professional visitors need. Importance: a public personal domain is durable and easily indexed. Expected benefit: lower spam and aggregation risk without making the owner unreachable. Effort: low to medium. Trade-off: extra contact friction may reduce casual messages. Redesign relationship: trust and intentional boundaries reinforce the mature identity the redesign seeks.

## Technical quality and maintainability

**Workspace-confirmed:** The architecture is plain HTML, CSS, and vanilla JavaScript on GitHub Pages with no build toolchain. Root pages repeat structure, HTML validity issues exist, styles are fragmented, and utilities depend on global variables or inline scripts. The gallery’s registry has an empty event title; context also records a duplicate-entry issue, though the currently inspected registry showed one matching slug. **Source-inferred:** Hand-maintained duplication and global data contracts are manageable at this scale but increase regression risk as the portfolio becomes more connected.

Keep the no-build boundary. Introduce a small documented page template, shared CSS layers, explicit JavaScript module responsibilities where browser support allows, and a lightweight manual release checklist. Use automated validators that can run locally or in optional GitHub Actions without becoming necessary to view or edit the site. Checks should cover HTML validity, broken internal links, missing image alternatives, duplicate IDs, file sizes, and basic scripted smoke paths.

**Major recommendation — standardize the static foundation rather than migrate platforms.** Problem: inconsistency, not lack of framework capability, is the principal maintenance issue. Importance: platform migration would consume attention without solving editorial hierarchy. Expected benefit: predictable updates, fewer regressions, and continued low-cost ownership. Effort: medium. Trade-off: shared snippets remain manually synchronized unless optional automation is adopted. Redesign relationship: this protects the architectural constraint while enabling the design and content system.

## Performance and reliability

**Workspace-confirmed:** Root pages have little JavaScript and should have a small core payload, but artwork is loaded directly with fixed display height and no explicit lazy-loading or responsive source strategy. HH Words loads an approximately 180KB JSON file and logs substantial data. The checklist relies on a CDN library; the Markdown reader relies on GitHub raw/API behavior; the China gallery relies on Google Drive previews and dynamically loaded event scripts. **Source-inferred:** Media weight and third-party availability, rather than application code, are the main reliability risks.

Prioritize image dimensions, compression, responsive variants where practical, lazy loading below the fold, stable aspect-ratio space, and a deliberately chosen hero image. Remove production debug logging. Make dependency failure local and explanatory: the surrounding page, project description, screenshots, and navigation should remain available when a dataset, CDN, GitHub, or Drive request fails. Optional service workers or analytics should follow evidence of need, not precede core optimization.

**Major recommendation — set a lightweight performance budget and resilient fallback policy.** Problem: rich media and external sources can make a simple static site feel slow or broken. Importance: first impressions and creative viewing depend on stable loading. Expected benefit: faster perceived performance and graceful degradation. Effort: medium; media preparation is the largest cost. Trade-off: multiple image variants add files and manual workflow. Redesign relationship: performance rules belong in the shared publishing standard and gallery curation process.

## Search and sharing readiness

**Workspace-confirmed:** Root pages reuse the same generic title, description, and keywords; no Open Graph, Twitter card, canonical, structured-data, sitemap, or robots artifacts were found in the inspected inventory. **Live-observed:** Search-facing content clearly identifies the person, but page-specific purposes are not represented in visible document titles. **Source-inferred:** Shared links are likely to produce generic previews and search engines receive weak differentiation among professional, project, and creative pages.

Give every public page a unique, descriptive title and summary, canonical URL, suitable social preview metadata, and representative image where appropriate. Add a small sitemap and basic Person/ProfilePage or CreativeWork structured data only when it accurately mirrors visible content. Use stable headings, descriptive link text, and index only pages intended for discovery. The primary search goal should be name plus professional identity; secondary goals can cover selected projects and art collections without keyword stuffing.

**Major recommendation — make metadata an editorial deliverable for every published page.** Problem: generic metadata discards context at the moment of search or sharing. Importance: discovery and link previews shape trust before a visit. Expected benefit: clearer search results, richer previews, and distinct identities for each pillar. Effort: low. Trade-off: preview images and descriptions need maintenance. Redesign relationship: metadata extends the same page proposition beyond the visual interface.

## Priorities by impact relative to effort

### Quick wins

1. **High impact / low effort:** define the core proposition, rename navigation around the three pillars, and add short introductions to Apps and My art. **Workspace-confirmed:** these destinations currently lack explanatory context. This immediately improves orientation while the fuller redesign is prepared.
2. **High impact / low effort:** replace generic titles/descriptions, add page language, correct visible spelling and high-confidence CV errors, give the portrait appropriate alt text, and add a strong shared focus style. These are small changes with messaging, accessibility, and sharing value.
3. **Medium impact / low effort:** label projects by maturity and add a consistent return-to-site link from each public tool. This reduces ambiguity and dead ends.
4. **Medium impact / low effort:** move primary contact toward LinkedIn or a dedicated public alias and review exposed detail. This lowers privacy risk with little visual cost.

### Foundations

1. **High impact / medium effort:** create shared tokens, responsive content widths, semantic page template, header, navigation, and footer. This should precede page-specific styling.
2. **High impact / medium effort:** establish accessibility acceptance checks and repair core semantics, keyboard behavior, focus, reflow, contrast, and interactive status communication.
3. **High impact / medium effort:** restructure the homepage as a balanced gateway and the professional section as an outcome-led narrative.
4. **Medium impact / medium effort:** set static-site publishing checks for links, HTML, metadata, images, and critical interactions.

### Strategic initiatives

1. **High impact / medium-high effort:** build selected project case studies around genuine users, constraints, choices, and lessons.
2. **High impact / medium-high effort:** curate Art and Journeys into collection entry points, prepare image assets, recover metadata, and provide archive access.
3. **Medium-high impact / high effort:** bring the China journey into the shared experience with resilient media fallbacks while retaining its event-data architecture.

### Refinements

After content and foundations settle, refine social preview images, structured data, subtle motion with reduced-motion support, print CV styling, art lightbox details, and optional automation. **Subjective judgment:** These will improve finish but should not displace message, accessibility, navigation, or curation.

## Phased roadmap and acceptance signals

**Phase 1 — direction and boundaries.** Agree the proposition, audiences, three-pillar map, content inclusion rules, public-contact method, and project maturity definitions. Inventory reusable content and flag facts requiring verification. Acceptance signal: a visitor can understand the full identity from a text-only outline, with each pillar receiving comparable prominence.

**Phase 2 — shared foundation.** Establish semantic template, design tokens, navigation behavior, accessibility checklist, metadata pattern, media rules, and fallback policy within the static architecture. Acceptance signal: representative root and interactive pages pass keyboard, zoom/reflow, contrast, validation, and no-JavaScript navigation checks appropriate to their behavior.

**Phase 3 — core narratives.** Deliver the balanced homepage, outcome-led professional presentation, maturity-labeled project index, and curated creative landing experience. Acceptance signal: each audience can reach relevant proof within two meaningful choices, and no pillar looks like an appendix.

**Phase 4 — depth.** Add selected case studies, art captions, journey chapters, optimized media, and robust interactive states. Acceptance signal: projects disclose purpose/status/limitations; creative collections supply context and preserve image integrity; external failures do not erase orientation.

**Phase 5 — refinement and observation.** Complete search/sharing details, print behavior, cross-links, and optional privacy-respecting measurement. External analytics, form services, or image CDNs should remain optional: the core site must work without a custom backend and remain understandable when third parties fail. Acceptance signal: a manual release checklist and periodic content review can maintain quality without specialized tooling.

## Risks and trade-offs

**Subjective judgment:** The largest risk is scope expansion. The repository invites work on many utilities, but the redesign succeeds through a coherent public selection, not simultaneous productization of every experiment. A strict “featured, archive, private” decision for each artifact will contain effort.

**Source-inferred:** A second risk is stale professional or certification language. Establish a review date and avoid claims that silently become inaccurate. A third is media workflow burden: responsive variants and metadata improve quality but add maintenance. Use a small number of standard sizes and document the manual process.

**Workspace-confirmed:** External Drive, GitHub, and CDN dependencies already support useful features. The risk is not their existence but treating them as invisible guarantees. Keep them optional to the core narrative and supply bounded failures. **Subjective judgment:** Finally, visual unification must not flatten the creative work into corporate branding; common structure should frame, not dominate, images and personal voice.

## Conclusion

**Workspace-confirmed:** hmhristov.com already contains the ingredients of a distinctive personal site: substantial professional experience, evidence of continued hands-on building, and a long-running creative record. **Live-observed:** Its current primary routes communicate those ingredients unevenly and with limited explanation. **Subjective judgment:** The redesign should reveal depth rather than manufacture sophistication.

The durable direction is a carefully edited, accessible professional studio built with the technologies already in hand. One proposition, three equal pillars, a restrained shared system, candid project maturity, curated creative collections, and responsible public boundaries will create more value than a framework migration. The result can remain inexpensive, portable, backend-independent, and personally maintainable while becoming markedly clearer, more credible, more humane, and more resilient.
