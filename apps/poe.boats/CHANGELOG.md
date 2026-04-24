# Changelog

## 0.14.1

### Patch Changes

- faa5612: add value override for Crimson Iron Ore Corrupted Growth modifier (1-2 roll range)

## 0.14.0

### Minor Changes

- d8f060b: Add value override system for idol modifiers that injects numeric value ranges where poedb shows static "an additional X" text. Larger idols (Conqueror) can now correctly show 1-2 values for Strongbox, Shrine, Harbinger, Imprisoned Monster, and Tormented Spirit modifiers.

### Patch Changes

- faa5612: Show selected rolled values instead of value ranges on inventory panel idol cards for cleaner display
- 058a625: Improve storage validation to be granular - removes only invalid data items instead of clearing all storage when validation fails. Adds Sentry alerts with detailed Zod error context when invalid data is detected.
  - Also clears `activeSetId` when it references a non-existent set
  - Refactor tests to use shared realistic fixtures with varied idol sets, map devices, and edge cases

## 0.13.1

### Patch Changes

- d45ed4c: Switch scarab price fetching from poe.ninja stash API to exchange API for improved reliability

## 0.13.0

### Minor Changes

- b44686b: Improve UI layout, state management, and code organization
  - Add weight numbers to mod displays in inventory cards, idol editor, and mod search dropdowns
  - Reorganize layout: move Browse Mods and League Selector to card above inventory, Share button above idol grid
  - Replace ExternalLink with ShoppingCart icon for trade search buttons
  - Make inventory action icons always visible instead of hover-only
  - Improve idol editor layout with name field next to type field
  - Add horizontal ScrollArea for set tabs with fixed New Set and Import buttons
  - Fix league selector to default to first available league if stored league not found
  - Fix inventory panel layout to prevent overflow under footer
  - Make league selector full width with matching popover width
  - Remove mechanics and weight filters from inventory panel (still available in Browse Mods)
  - Add useStorageState hook for persistent state management in favorites and trade settings
  - Add storage utility functions for loading and saving settings with validation
  - Refactor grid logic by extracting utility functions to grid-utils module
  - Update localization strings for 'browseMods' and 'share' actions across multiple languages

## 0.12.0

### Minor Changes

- 3ce53b2: Add duplicate detection for shared idol sets. When importing a shared set that already exists in your collection (based on content hash), you'll see a prompt to either view the existing set or import it anyway.
- c83c63e: Enhanced weight filter for trade searches with new features:
  - Added option for separate prefix/suffix weight sliders
  - Added toggle to switch between GTE (>=) and LTE (<=) comparison modes
  - Weight filter now applies to both idol trade searches and single mod searches in Browse Mods
  - The "not" query group excludes all mods that match the weight criteria for that idol type
  - Removed multi-select functionality from inventory panel for simpler UX
  - Slider now snaps to actual mod weights instead of fixed increments
- 5742848: Add idol mod weights feature:
  - Display mod weights in the mods search modal
  - Add max weight filter for trade searches with dynamic range based on actual mod data
  - Mods above the weight threshold are added to a "not" filter in trade API (excludes items with common mods)
  - Add toggle switch to enable/disable weight filtering
  - Add single-mod trade search buttons in mods search modal and idol tooltips
  - Fix league name validation to allow periods (e.g., "Phrecia 2.0")

### Patch Changes

- 73bdecb: Derive default league from leagues.json instead of hardcoding it. The default league is now the first PC realm league in the data file.

## 0.11.3

### Patch Changes

- update idol data with trade stat IDs for modifiers and add Refiner's Bargain unique idol

## 0.11.2

### Patch Changes

- Update idol mods, scarabs, leauges as of 2026-01-30

## 0.11.1

### Patch Changes

- 0eef50c: automatically sort favorited modifiers to the top of lists
- f45e2b3: fix LeagueProvider not available on /changelog route (QS-POE-IDOL-PLANNER-4)
- 7a5b394: fix crash when root loader fails by adding null check for theme data
- 3cfb3ff: fix GET request body error when bots crawl the site

## 0.11.0

### Minor Changes

- 464f959: Add Sentry client-side error tracking with hydration and browser extension error filtering

### Patch Changes

- 0b07112: Improve mobile responsiveness: fix layout stacking, modal widths, and header/button visibility on small screens. Use narrower sidebar columns (280px/260px) at lg breakpoint, wider (400px/350px) at xl breakpoint to prevent overlap.
- 689b75f: Fix scarab price API issues: eliminate double API requests by sharing state via LeagueContext and ScarabPricesContext, and ensure prices update correctly when changing leagues. Also fix unnecessary scrollbar on the main app layout.

## 0.10.0

### Minor Changes

- 744844b: Add toast notifications when localStorage save validation fails

## 0.9.2

### Patch Changes

- fix prefixes validation logic - condition was incorrectly checking > 2 instead of <= 2

## 0.9.1

### Patch Changes

- f4bc8a7: fix prefixes array validation to support unique idol mods storage while enforcing 2-prefix limit

## 0.9.0

### Minor Changes

- f47db0b: Improve idol mechanic detection by extracting mechanics from mod family IDs before falling back to text-based detection. This fixes misclassified mods (e.g., Ritual Splinters incorrectly tagged as Legion) and properly categorizes shrine, strongbox, maven, and other mechanics that were previously all classified as "map". Added 12 new mechanics: ascendancy, cleansing (Searing Exarch), fortune, scarab, scouting, settlers, shaper, synthesis, tangle (Eater of Worlds), torment, vaal, and zana.

## 0.8.0

### Minor Changes

- Update with new idol data
- 5f78db0: add trade search improvements:
  - default to instant buyout (status: available) instead of "any"
  - map unique idol mods to trade stat IDs in data script
  - unique idol "Maps found in Area" uses implicit stat ID (base implicit, 2% per cell)
  - regular prefix mod uses explicit stat ID as expected
  - enable trade searching for unique idol mods
  - show base implicit "X% increased Maps found in Area" in stats summary (2% per cell)

### Patch Changes

- d57192e: fix unique idol mods not appearing in total stats summary, fix share link expiry text to correctly indicate links never expire
- 0294997: fix trade links only including first 2 mods, now includes up to 4 mods (2 prefixes + 2 suffixes)

## 0.7.0

### Minor Changes

- 4735020: Consolidate trade stat mappings into idol-modifiers.json. The converter now fetches trade stats directly from the POE API and embeds `tradeStatId` into each modifier tier, eliminating the separate trade-stat-mappings files.
  - Improve trade stat matching to handle decimal number ranges (e.g., `(0.8—1.2)%`)
  - Add direction word canonicalization so opposite modifiers match (reduced↔increased, less↔more, slower↔faster, fewer↔additional)
  - Reduce unmatched modifiers from 31 to 8 (74% improvement)

### Patch Changes

- 229e602: Fix unique idol search filtering and remove shared set expiry
  - Fix unique idol selector search not filtering items by adding custom filter function to Command component
  - Remove 30-day expiry from shared sets - shares are now permanent

## 0.6.0

### Minor Changes

- 6d8a998: Remove redundant schema fields and derive values at runtime:
  - Remove `tab` and `activeTab` from idol set schema (tabs feature removed)
  - Remove `valueRange` and `mechanic` from modifier schema (derivable from modId)
  - Remove `corrupted` from idol schema (idols cannot be corrupted)
  - Add `getModValueRange()` helper for runtime value range derivation
  - Existing data migrates automatically via Zod schema parsing
- 1243d3f: Add dynamic OpenGraph and Twitter meta tags for shared sets, including set name, league mechanics, scarabs, and scarab cost

### Patch Changes

- 0190c56: Move browse mods button above search input with visible text label
- db04399: Fix grid placement allowing idols to move to positions that partially overlap their current location
- 16c02b1: Remove copy to inventory button from idol grid
- 039acc6: Only pre-populate import modal from clipboard when clipboard contains valid idol data

## 0.5.0

### Minor Changes

- bf82043: refactor mod storage to use mod IDs for localization support
  - Store mod IDs instead of text in saved data, enabling proper localization when switching languages
  - Add mod text resolver utility that looks up localized text from modifier definitions
  - Migrate storage from v4 to v5, stripping redundant text from matched mods
  - Update display components to resolve mod text dynamically based on current locale
  - Unmatched mods retain their original text as fallback

### Patch Changes

- 940d3b7: add SVG favicon with golden idol design

## 0.4.1

### Patch Changes

- 88eecde: update CLAUDE.md with missing data scripts and cloudflare integration details
- 88eecde: improve mods search modal: show idol type icons with names instead of tier count, update filter layout to full-width 2-column grid
- 046e54b: default to dark mode for new visitors
- 71abcea: fix nested button HTML violation in idol card and scarab slot components

## 0.4.0

### Minor Changes

- 234df15: add map device unlock tracking per set - dropdown with toggles to select which atlas/boss unlocks are completed, locked grid slots shown with amber lock icons and tooltips explaining the requirement. All unlocks are enabled by default.

  update scarab images to use local files only, remove CDN fallback - scarab converter script now returns null for missing images instead of falling back to CDN URLs.

- 1b59c11: - add league selector to header for selecting trade league
  - trade searches now use the selected league instead of hardcoded default
  - league selection persists to localStorage
  - add data:leagues script to fetch available leagues from PoE API
- 9544f9a: - fix scarab selector to show all category types instead of only first 8
  - remember selected scarab category filter across slots
  - add map device crafting options (standard and imbued)
  - imbued options only available when Horned Scarab of Awakening is selected
  - display crafting option effect on map device card and in total stats summary
- 8de3cca: add unique idol parsing to poedb-converter script - extracts 40 unique Minor Idols with names, base types, implicit/explicit modifiers, and value ranges from poedb.tw pages
- fc5842d: add confirmation dialog for idol deletion and import button for shared sets
- e950dc2: Enhanced unique idol support: added "unique" modifier type for proper mod storage and display, unique idol images for Minor idols, amber/gold mod coloring, and searchable unique idol selector with mod text filtering
- 03b1571: feat: parse imported idol values into preset mods for editing

  When importing an idol from POE clipboard, the parser now matches modifier text against known modifier definitions. This allows imported idols to be edited with the preset mods already filled out (correct tier, rolled value, modifier ID, and mechanic).
  - Added `mod-matcher.ts` with text normalization and matching logic
  - Integrated matching into `idol-parser.ts` conversion flow
  - Added comprehensive tests for matching and integration

- 3094de4: remove legacy storage schemas (V1-V3) and migration functions
- 92fa1eb: - add Cloudflare cron job to fetch scarab prices from POE Ninja every 15 minutes
  - store scarab prices in KV namespace per league
  - add API endpoint to retrieve cached scarab prices
  - display chaos prices in map device scarab selector and tooltips
- 94a7f80: Add mods search modal, unique idols support, and multi-select mechanic filters
  - Move unlocks dropdown into map device section header
  - Add new mods search modal with filters for type, favorites, and mechanics (accessible via Browse Mods button)
  - Add unique idols as a selectable option in the create idol dropdown
  - Update all mechanic filters to support multi-select (inventory panel, idol editor, mods search)
  - Add translations for new features across all 10 locales

### Patch Changes

- 929d10d: Add Harbinger mechanic to filter list - fixes Harbinger mods being incorrectly categorized as "map" mechanic
- fc5842d: fix drag preview highlighting showing red on valid cells
- 234df15: - increase total stats panel width from 300px to 350px
  - show idol type names (Minor, Kamasan/Noble, Totemic/Burial, Conqueror) instead of generic sizes in stat contribution breakdown
- 2dc4aa5: fix ScrollArea not scrolling with mouse wheel inside Dialog
- 0e97325: - fix idol grid hover to show remove/copy buttons when hovering any cell of multi-cell idols, not just the top-left origin cell
  - fix tooltip positioning to show on the opposite side when hovering wide idols (left half shows tooltip on right, right half shows on left)
  - fix drag-and-drop to allow dropping an idol onto its own position for repositioning
  - add Zod validation for share ID format in share API endpoint
  - add Zod validation for league query parameter in scarab prices API endpoint

## 0.3.0

### Minor Changes

- fbc1e58: add per-set inventories and idol copy/paste between sets
  - each set now has its own isolated inventory (storage schema v1 to v2 migration)
  - add copy icon on idol cards to copy idols to clipboard for pasting into other sets
  - add paste button in inventory panel when clipboard has an idol
  - add X button on grid idols to remove them on hover
  - add clear button on mod slots in idol editor to unselect mods
  - auto-read clipboard when import modal opens (no manual paste needed)
- 25b76a9: add scarabs map device, favorite mods, multi-select, and fix UI bugs
  - add 5-slot map device for selecting scarabs with searchable dropdown and category filters
  - scarab effects display in stats summary panel grouped by category
  - fetch and parse scarab data from poedb.tw with local image caching
  - storage schema v2 to v3 migration for mapDevice support
  - fix tooltip overflow with collision detection on idol cards
  - fix inventory and stats panel scroll issues with min-h-0 flex constraints
  - fix grid hover detection so tooltips show when hovering any cell of an idol
  - improve drag-and-drop visual feedback: custom drag image shows full idol with rarity border when dragging from any cell
  - add favorite mods feature: click star icon to save frequently used mods, filter to show favorites only
  - add multi-select for inventory: Ctrl+click to toggle selection, Shift+click for range select, bulk delete selected idols

### Patch Changes

- a68ec49: fix UI/UX issues: dedupe mod list by tier text, hide tier selector when only one tier exists, remove tier display from idol cards, fix tooltip contrast on grid idol hover, fix stats aggregation math for mods with multiple numbers
  - fix stats sum calculation for mods with range text format like "(10—8)%" to properly sum rolled values
  - move "Find Similar on Trade" from context menu to top hover icons on idol cards
- a8d6be1: fix UI/UX issues: prevent duplicate mods on same idol, filter mechanics dropdown by display text (allows "exile" to find "Anarchy"), enable dragging idols from any cell for movement, fix modal dropdown mouse wheel scrolling
- 332ebe8: fix light mode contrast issues: replace hardcoded dark-mode colors with theme-aware CSS variables across all components
  - add theme color guidelines to CLAUDE.md
- a018c13: fix Rogue Exile mods incorrectly categorized as Heist; add new "anarchy" mechanic with translations

## 0.2.0

### Minor Changes

- 142db67: fix drag and drop and add idol move functionality:
  - fix drag and drop by switching from DropdownMenu to ContextMenu (left-click now drags, right-click opens trade menu)
  - add ability to drag and reposition idols already placed on the grid
  - size placed idols based on CELL_SIZE constant (64px) instead of hardcoded values
  - track source placement during drag operations for proper collision detection
  - Total Stats panel now sums identical mod values instead of showing ranges and multipliers
- 2e11f3f: Add GitHub Actions CI/CD workflows and changelog route
  - CI workflow for lint/test on PRs to dev/main
  - Automatic deployment to dev environment on push to dev branch
  - Automatic deployment to production on push to main branch
  - Changeset release workflow for version management
  - Changelog page at /changelog using react-markdown
  - Vitest configuration for unit testing with snapshot support

- d7beed8: Add core idol planner functionality with inventory management and data import
  - Idol grid and inventory panel for placing and managing idols
  - Import modal supporting POE clipboard formats (Ctrl+C and Ctrl+Alt+C)
  - Idol card component with modifier display and rarity styling
  - Set tabs for managing multiple idol configurations
  - Stats summary panel aggregating modifier values
  - POEDB data converter scripts for fetching idol modifier data
  - Zod schemas for type-safe idol, inventory, and set validation
  - i18n infrastructure with English locale and type-safe translation keys
  - Local storage persistence for idol sets and inventory
  - UI components: button, card, dialog, dropdown-menu, input, scroll-area, select, tabs, textarea, tooltip

- 11047db: add mod validation by idol type in editor - mods are now filtered to only show options valid for the selected idol base type, and invalid mods are cleared when changing idol type
- f1b3c04: improve inventory and modal UI:
  - increase inventory panel width and show full mod details with highlighted numbers
  - fix scroll issues in modals and inventory
  - show mod text in idol editor when selecting mods
  - increase modal width and enable text wrapping
  - remove item level from UI
  - reduce padding around idol names in cards
  - add idol icons to inventory cards and base type dropdown selector
  - add edit button to inventory idols
  - replace number input with slider for modifier value ranges
- 8754801: Add custom 404 page with Path of Exile themed design
  - Atmospheric dark design with floating particles and fog effects
  - Glitch effect on 404 text with red/cyan color splitting
  - Golden/bronze gradient text matching POE's aesthetic
  - "Return to Hideout" button with portal icon and hover effects
  - Error boundary integration for route-level 404 handling
  - Snapshot tests for the 404 page component
  - Update global color palette to match POE amber/bronze theme

- 7bea252: add click to edit and duplicate idol features in inventory
- 658b985: Add search, filtering, and idol editor functionality
  - Mod search component with Command combobox for searchable modifier selection
  - MechanicFilter component for filtering mods by league mechanic
  - Idol editor modal for creating custom idols with prefix/suffix selection
  - Updated inventory panel with mechanic filter and Create button
  - Unit tests for idol-parser (25 tests)
  - Translations for editor and filter UI

- 6ea55a5: Add translations for all 9 supported locales (zh-TW, zh-CN, ko, ja, ru, pt-BR, de, fr, es)
- 84568f6: Update poedb parser to fetch mods per idol type from individual pages
  - Parse individual idol pages (Minor, Noble, Kamasan, Burial, Totemic, Conqueror) instead of general Idols page
  - Extract modifier data from embedded ModsView JSON with accurate value ranges per idol type
  - Track `idolSource` and `modFamily` for each modifier to enable proper filtering
  - Generate unique mod IDs that include idol type (e.g., `prefix_minor_additional_abyss_chance`)
  - Correctly map ModGenerationTypeID to prefix (1) or suffix (2)
  - 757 total modifiers parsed with proper idol type distribution
  - Add 28 unit tests for poedb parser covering parsing, value extraction, and error handling

- 502078a: Add trade search integration with dynamic stat mapping generation
  - Trade search library for generating pathofexile.com/trade URLs
  - Dynamic trade stat mapping generation via poedb-converter script
  - Auto-generated mappings from POE trade API stats data (368 mappings, 96% coverage)
  - "Find Similar on Trade" dropdown menu on idol cards in inventory
  - Functions: generateTradeUrl(), generateTradeUrlForBaseType(), generateTradeUrlForMod()
  - Unit tests for trade search functionality

- 4999691: Add sharing functionality with Cloudflare KV integration
  - Share schema with 30-day TTL expiration for shared sets
  - API routes for creating and retrieving shared sets (POST/GET /api/share)
  - Share page for loading and importing shared idol configurations
  - ShareModal component with copy-to-clipboard functionality
  - Share button integrated into app header

### Patch Changes

- e2920d2: Add navigation link to changelog page in app header
- 1689061: Improve blocked grid cell visibility with distinct red styling

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
