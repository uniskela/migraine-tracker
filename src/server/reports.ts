import PDFDocument from "pdfkit";
import { ZipArchive } from "archiver";
import type { Response } from "express";
import { DateTime } from "luxon";
import {
  bounds,
  comparison,
  duration,
  inPeriod,
  periodDays,
  summary,
  type Period,
} from "../shared/stats.js";
import type { AccountData } from "./repository.js";
/** Encode quoted UTF-8 CSV cells and neutralize spreadsheet formula prefixes. */
export function csv(rows: unknown[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value == null ? "" : String(value);
            if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "\u0027" + text;
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
/** Export episodes overlapping the optional local date range, including recorded medication names. */
export function episodeCsv(data: AccountData, period?: Period) {
  return csv([
    [
      "ID",
      "Start (UTC)",
      "End (UTC)",
      "Severity",
      "Side",
      "Locations",
      "Pain character",
      "Symptoms",
      "Associated factors",
      "Functional impact",
      "Disruptions",
      "Activities",
      "Sleep hours",
      "Notes",
      "Medications",
    ],
    ...data.episodes
      .filter((e) => !period || inPeriod(e, period, data.settings.timezone))
      .map((e) => [
        e.id,
        e.startedAt,
        e.endedAt,
        e.severity,
        e.side,
        e.locations.join("; "),
        e.characters.join("; "),
        e.symptoms.join("; "),
        e.factors.join("; "),
        e.impact,
        e.disruptions.join("; "),
        e.activities.join("; "),
        e.sleep?.hours,
        e.notes,
        data.doses
          .filter((d) => d.episodeId === e.id)
          .map(
            (d) =>
              `${data.medications.find((m) => m.id === d.medicationId)?.name}: ${d.dose} ${d.units}`,
          )
          .join("; "),
      ]),
  ]);
}
/** Wrap account data in a versioned migration envelope with its export timestamp. */
export function portableExport(data: AccountData) {
  return {
    format: "migraine-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
}
/** Stream portable JSON and tabular CSV files without persisting an export on the server. */
export function exportZip(data: AccountData, res: Response) {
  res.attachment("migraine-data.zip");
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", () => res.destroy());
  archive.pipe(res);
  archive.append(JSON.stringify(portableExport(data), null, 2), {
    name: "data.json",
  });
  archive.append(episodeCsv(data), { name: "episodes.csv" });
  for (const name of [
    "medications",
    "doses",
    "effects",
    "weights",
    "daily",
    "schedules",
  ] as const) {
    const rows = data[name];
    const keys = rows.length ? Object.keys(rows[0]) : [];
    archive.append(
      csv([
        keys,
        ...rows.map((row) =>
          keys.map((key) => {
            const v = (row as Record<string, unknown>)[key];
            return typeof v === "object" ? JSON.stringify(v) : v;
          }),
        ),
      ]),
      { name: `${name}.csv` },
    );
  }
  void archive.finalize();
}
/** Collect period-scoped observations and a doctor note without diagnostic conclusions. */
export function reportData(data: AccountData, period: Period, note: string) {
  const { start, end } = bounds(period, data.settings.timezone);
  return {
    format: "migraine-doctor-report",
    version: 1,
    period,
    timezone: data.settings.timezone,
    note,
    summary: summary(
      data.episodes,
      data.doses,
      data.medications,
      period,
      data.settings.timezone,
    ),
    episodes: data.episodes.filter((e) =>
      inPeriod(e, period, data.settings.timezone),
    ),
    medications: data.medications,
    doses: data.doses.filter(
      (d) => Date.parse(d.takenAt) >= start && Date.parse(d.takenAt) < end,
    ),
    effects: data.effects.filter(
      (e) => e.date >= period.from && e.date <= period.to,
    ),
    disclaimer:
      "This application records and summarises information and does not provide medical advice.",
  };
}
/** Stream a printable report with local fonts, observed trends and explicit comparison limitations. */
export function pdfReport(
  data: AccountData,
  period: Period,
  note: string,
  appName: string,
  res: Response,
) {
  const report = reportData(data, period, note);
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: { Title: "Migraine journal report", Author: appName },
  });
  doc.registerFont("Journal", "assets/fonts/DejaVuSans.ttf");
  doc.registerFont("JournalBold", "assets/fonts/DejaVuSans-Bold.ttf");
  doc.font("Journal");
  res.type("pdf").attachment(`migraine-report-${period.from}-${period.to}.pdf`);
  doc.pipe(res);
  /** Start a styled PDF section, adding a page when the heading would be too near the footer. */
  const heading = (text: string) => {
    if (doc.y > 700) doc.addPage();
    doc
      .moveDown()
      .font("JournalBold")
      .fontSize(14)
      .fillColor("#31564d")
      .text(text)
      .moveDown(0.4)
      .font("Journal")
      .fontSize(10)
      .fillColor("#263832");
  };
  /** Render a report paragraph with a page break when the current page is full. */
  const line = (text: string) => {
    if (doc.y > 745) doc.addPage();
    doc.text(text, { lineGap: 4 });
  };
  doc.fontSize(24).fillColor("#31564d").text("Migraine journal");
  doc
    .fontSize(11)
    .text(`${period.from} to ${period.to}  |  ${report.timezone}`);
  heading("Summary");
  const s = report.summary;
  /** Display one decimal place or explicitly mark an unrecorded metric. */
  const number = (n: number | null) =>
    n === null ? "Not recorded" : n.toFixed(1);
  line(
    `Migraine days: ${s.migraineDays} / ${s.periodDays}   Episodes overlapping period: ${s.episodes}`,
  );
  line(
    `Average severity: ${number(s.averageSeverity)} / 10 (${s.severityRecorded} recorded)`,
  );
  line(
    `Average completed duration: ${number(s.averageDuration)} hours (${s.completedEpisodes} wholly in period)`,
  );
  line(
    `Total migraine hours in period: ${s.totalHours.toFixed(1)}   Ongoing episodes: ${s.ongoing}`,
  );
  line(
    `Significantly impacted days (impact 3-5): ${s.impactedDays}   Average impact: ${number(s.averageImpact)} / 5`,
  );
  line(`Acute medication days: ${s.acuteDays}   Doses: ${s.acuteDoses}`);
  line(
    "Unrecorded days are unknown. Duration is clipped to the period; an ongoing episode is counted through report generation.",
  );
  heading("Migraine days over time");
  const daysInReport = periodDays(period),
    groupSize = Math.max(1, Math.ceil(daysInReport / 10));
  const groups = Array.from(
    { length: Math.ceil(daysInReport / groupSize) },
    (_, i) => {
      const from = DateTime.fromISO(period.from).plus({ days: i * groupSize });
      const to = DateTime.min(
        from.plus({ days: groupSize - 1 }),
        DateTime.fromISO(period.to),
      );
      return {
        label: from.toFormat("d MMM"),
        value: summary(
          data.episodes,
          data.doses,
          data.medications,
          { from: from.toISODate()!, to: to.toISODate()! },
          data.settings.timezone,
        ).migraineDays,
      };
    },
  );
  if (doc.y > 610) doc.addPage();
  const chartY = doc.y + 12,
    column = 480 / groups.length,
    highest = Math.max(1, ...groups.map((g) => g.value));
  groups.forEach((g, i) => {
    const h = (g.value / highest) * 70;
    doc
      .fillColor("#63836d")
      .roundedRect(
        48 + i * column,
        chartY + 75 - Math.max(2, h),
        column - 9,
        Math.max(2, h),
        2,
      )
      .fill();
    doc
      .fillColor("#263832")
      .fontSize(8)
      .text(String(g.value), 48 + i * column, chartY + 60 - h, {
        lineBreak: false,
      });
    doc.text(g.label, 48 + i * column, chartY + 84, { lineBreak: false });
  });
  doc.x = 48;
  doc.y = chartY + 108;
  doc.fontSize(10);
  line(
    `${groupSize}-day groups; count of recorded migraine days. Missing entries are not confirmed symptom-free days.`,
  );
  heading("Preventive medications and comparisons");
  const preventive = data.medications.filter(
    (m) =>
      m.category === "preventive" &&
      (!m.startDate || m.startDate <= period.to) &&
      (!m.endDate || m.endDate >= period.from),
  );
  if (!preventive.length)
    line("No preventive medications recorded for this period.");
  for (const m of preventive) {
    line(
      `${m.name} - ${m.dose ?? ""} ${m.units}, ${m.frequency}. Started ${m.startDate || "not recorded"}; ended ${m.endDate || "not recorded"}.`,
    );
    if (m.startDate && m.startDate <= period.to) {
      const start = DateTime.fromISO(m.startDate);
      const afterEnd = [
        start.plus({ days: 29 }).toISODate()!,
        period.to,
        m.endDate || period.to,
      ].sort()[0];
      const after = { from: m.startDate, to: afterEnd };
      const days =
        Math.round(DateTime.fromISO(afterEnd).diff(start, "days").days) + 1;
      const before = {
        from: start.minus({ days }).toISODate()!,
        to: start.minus({ days: 1 }).toISODate()!,
      };
      const c = comparison(
        data.episodes,
        data.doses,
        data.medications,
        before,
        after,
        data.settings.timezone,
      );
      line(
        `Comparison: ${before.from} to ${before.to} versus ${after.from} to ${after.to}.`,
      );
      line(
        `Migraine days / 30 days: ${c.before.migraineDaysPer30.toFixed(1)} -> ${c.after.migraineDaysPer30.toFixed(1)}; hours / 30 days: ${c.before.migraineHoursPer30.toFixed(1)} -> ${c.after.migraineHoursPer30.toFixed(1)}.`,
      );
      line(
        `Severity: ${number(c.before.averageSeverity)} -> ${number(c.after.averageSeverity)}; impacted days / 30: ${c.before.impactDaysPer30.toFixed(1)} -> ${c.after.impactDaysPer30.toFixed(1)}; acute days / 30: ${c.before.acuteDaysPer30.toFixed(1)} -> ${c.after.acuteDaysPer30.toFixed(1)}.`,
      );
    }
  }
  line(
    "Observational data only. Differences do not establish medication effects or causation. Recording coverage and other changes can influence results.",
  );
  heading("Reported side effects");
  if (!report.effects.length) line("None recorded during this period.");
  for (const e of report.effects)
    line(
      `${e.date} | ${data.medications.find((m) => m.id === e.medicationId)?.name} | ${e.name}, ${e.severity}/5${e.notes ? ` - ${e.notes}` : ""}`,
    );
  heading("Episode timeline");
  if (!report.episodes.length) line("No episodes recorded during this period.");
  for (const e of [...report.episodes].reverse()) {
    const timestamp = DateTime.fromISO(e.startedAt)
      .setZone(data.settings.timezone)
      .toFormat("d MMM yyyy, HH:mm");
    line(
      `${timestamp} | severity ${e.severity ?? "unrecorded"}/10 | ${duration(e.startedAt, e.endedAt)}${e.endedAt ? "" : " (ongoing)"} | impact ${e.impact ?? "unrecorded"}/5`,
    );
    if (e.symptoms.length) line(`Symptoms: ${e.symptoms.join(", ")}`);
    if (e.factors.length) line(`Associated factors: ${e.factors.join(", ")}`);
    if (e.disruptions.length) line(`Disruptions: ${e.disruptions.join(", ")}`);
    if (e.notes) line(`Notes: ${e.notes}`);
    for (const d of report.doses.filter((d) => d.episodeId === e.id))
      line(
        `Medication: ${data.medications.find((m) => m.id === d.medicationId)?.name}, ${d.dose} ${d.units}, ${DateTime.fromISO(d.takenAt).setZone(data.settings.timezone).toFormat("d MMM HH:mm")}; relief ${d.effectiveness || "not recorded"}.`,
      );
    doc.moveDown(0.5);
  }
  heading("Note for your doctor");
  line(note || "No additional note.");
  heading("About this report");
  line(report.disclaimer);
  line(
    "All entries are self-reported. Migraine days use the configured timezone. Overlapping episodes may double-count hours. No diagnostic conclusions are made.",
  );
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        `Private health information  |  ${i + 1} / ${pages.count}`,
        48,
        795,
        { lineBreak: false },
      );
  }
  doc.end();
}
