---
"@poe-tools/stash-ingest": patch
---

Re-deliver every changed stash hour of a delivery together. Each delivered hour whose sales changed used to go out in its own request, so a cycle sent one small request for every hour still in the database, and the receiver recounted those hours and refreshed each changed item's day once per hour. Their changed markets now wait until the delivery's stash hours have been read and go out in as few requests as they fit; an hour never delivered is still sent whole at once.
