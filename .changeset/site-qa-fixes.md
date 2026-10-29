---
"poe-boats": patch
---

Fix bugs found in a browser test of the site:

- Idol planner: importing a pasted share link opens the share page instead of a 404, and a saved set that references a scarab no longer in the data loads instead of crashing.
- Market: the Forbidden jewels tab lists jewels by default (every listed one is corrupted), and item pages have the item name in their title.
- Crafting emulator: a craft repeated after Undo or Reset rolls a new outcome instead of the previous one.
- Unknown pages return a 404 status and show the not-found message inside the site layout.
- The home, PoE 1, PoE 2 and sign-in pages have titles, and the footer's poedb.tw link is readable.
- PoE 2 market icons for runes, soul cores and other exchange items that poe2db does not host come from the trade site.
