// Synthetic screenshot fixture. Only targets a deliberately isolated loopback test server.
const base = "http://localhost:3200/api";
const setup = await fetch(`${base}/auth/setup`, {
  method: "POST",
  headers: {
    Origin: "http://localhost:3200",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "demo-journal",
    password: "synthetic-demo-password",
    setupSecret: "synthetic-ui-review-setup-secret-32-characters",
    timezone: "Australia/Sydney",
  }),
});
if (setup.status !== 201)
  throw Error("Use a fresh isolated UI review database.");
const { csrf } = await setup.json();
const cookie = setup.headers.get("set-cookie").split(";")[0];
async function post(path, body, method = "POST") {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3200",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(`Fixture rejected: ${path}`);
  return r.json();
}
const acute = await post("/medications", {
  name: "Rizatriptan / Maxalt",
  category: "acute",
  units: "tablet",
  notes: "Synthetic demonstration, not a recommendation.",
});
const preventive = await post("/medications", {
  name: "Pizotifen / Sandomigran",
  category: "preventive",
  dose: 0.5,
  units: "mg",
  frequency: "Nightly",
  startDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
  notes:
    "Synthetic example taken from the product brief, not a recommendation.",
});
for (const [index, days] of [1, 5, 8, 13, 18, 23].entries()) {
  const start = new Date(Date.now() - days * 86400000 - 6 * 3600000),
    end = new Date(start.getTime() + [4.3, 2, 3, 6, 3, 5][index] * 3600000);
  const episode = await post("/episodes", {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    severity: [6, 4, 5, 7, 5, 6][index],
    side: index % 2 ? "Left" : "Right",
    symptoms: ["Nausea", "Light sensitivity"],
    factors:
      index % 2
        ? ["Poor sleep", "Stress"]
        : ["Neck tension", "Prolonged screen time"],
    characters: ["Throbbing"],
    locations: ["Temple"],
    impact: index % 2 ? 2 : 3,
    notes: "Synthetic demonstration episode.",
  });
  if (index !== 1)
    await post("/doses", {
      medicationId: acute.id,
      episodeId: episode.id,
      dose: 1,
      units: "tablet",
      takenAt: new Date(start.getTime() + 1800000).toISOString(),
      effectiveness: "Good",
      notes: "Synthetic demonstration only.",
    });
}
await post("/effects", {
  medicationId: preventive.id,
  name: "Morning grogginess",
  severity: 2,
  date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  notes: "Synthetic demonstration only.",
});
console.log("Synthetic UI fixtures created in the isolated review server.");
