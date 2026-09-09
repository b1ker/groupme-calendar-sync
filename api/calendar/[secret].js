const { buildIcs } = require("../../lib/ics");

// GET /api/calendar/<secret>
//
// Fetches this GroupMe group's active Events (games, practices, everything
// currently on the calendar — GroupMe simply omits cancelled ones from this
// list) and returns them as a live .ics feed. Point a calendar app's
// "subscribe by URL" feature at this endpoint and it will re-fetch
// periodically, picking up new events, time changes, and cancellations
// automatically — no manual re-import needed.
//
// Required environment variables (set in Vercel project settings, never
// committed to the repo):
//   GROUPME_TOKEN     - your personal GroupMe access token (dev.groupme.com)
//   GROUPME_GROUP_ID  - the numeric group/conversation id
//   CALENDAR_SECRET   - a random string only you know; it's the last path
//                       segment of the URL, acting as a simple shared secret
//                       so strangers can't guess your feed URL.
//   CALENDAR_NAME     - optional, display name for the calendar (defaults
//                       to "Team Calendar")

module.exports = async function handler(req, res) {
  const { secret } = req.query;

  const expectedSecret = process.env.CALENDAR_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    // Deliberately vague — don't reveal whether the secret was close.
    res.status(404).send("Not found");
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  const groupId = process.env.GROUPME_GROUP_ID;

  if (!token || !groupId) {
    res.status(500).send(
      "Server misconfigured: GROUPME_TOKEN and GROUPME_GROUP_ID must be set as environment variables."
    );
    return;
  }

  try {
    const events = await fetchAllEvents(groupId, token);
    const ics = buildIcs(events, {
      calendarName: process.env.CALENDAR_NAME || "Team Calendar",
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="team-calendar.ics"'
    );
    // Edge-cache briefly so a burst of subscriber polls doesn't hammer
    // GroupMe's API, while still staying reasonably fresh.
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=600"
    );
    res.status(200).send(ics);
  } catch (err) {
    res.status(502).send(`Failed to fetch events from GroupMe: ${err.message}`);
  }
};

async function fetchAllEvents(groupId, token) {
  // The group's active Events list. 100 is comfortably more than a season's
  // worth of games + practices; see README for notes on pagination if that
  // ever changes.
  const url = `https://api.groupme.com/v3/conversations/${encodeURIComponent(
    groupId
  )}/events/list?limit=100&token=${encodeURIComponent(token)}`;

  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`GroupMe API returned HTTP ${r.status}`);
  }
  const data = await r.json();
  return (data && data.response && data.response.events) || [];
}
