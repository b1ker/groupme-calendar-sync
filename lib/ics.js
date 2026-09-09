// Minimal, dependency-free ICS (iCalendar) builder.
// We convert every timestamp to UTC ("Z") so the feed renders correctly
// in any viewer's local timezone without needing a VTIMEZONE block.

function escapeText(str = "") {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Fold lines longer than 75 octets per RFC 5545 so strict parsers are happy.
function foldLine(line) {
  if (line.length <= 75) return line;
  let result = "";
  let rest = line;
  while (rest.length > 75) {
    result += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return result + rest;
}

/**
 * @param {Array<object>} events - raw GroupMe event objects (from /events/list)
 * @param {object} opts - { calendarName }
 * @returns {string} full VCALENDAR text
 */
function buildIcs(events, opts = {}) {
  const calendarName = opts.calendarName || "Team Calendar";
  const nowStamp = toIcsUtc(new Date().toISOString());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GroupMe Calendar Sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Hints some clients respect for how often to re-poll.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const e of events) {
    if (!e.start_at) continue; // skip anything malformed
    const dtstart = toIcsUtc(e.start_at);
    if (!dtstart) continue;

    const uid = `${e.event_id || e.id}@groupme-calendar-sync`;
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${uid}`));
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dtstart}`);

    const dtend = e.end_at ? toIcsUtc(e.end_at) : null;
    if (dtend) lines.push(`DTEND:${dtend}`);

    lines.push(foldLine(`SUMMARY:${escapeText(e.name || "Event")}`));

    if (e.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(e.description)}`));
    }

    if (e.location && e.location.name) {
      const loc = e.location.address
        ? `${e.location.name}, ${e.location.address}`
        : e.location.name;
      lines.push(foldLine(`LOCATION:${escapeText(loc)}`));
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

module.exports = { buildIcs };
