"use strict";

// Dropdown options. Your listenings.json "period" values must match these exactly.
// (Exam rule: 9th-11th centuries = century only; 12th-16th = early or late half.)
const PERIODS = [
  "9th century",
  "10th century",
  "11th century",
  "Early 12th century",
  "Late 12th century",
  "Early 13th century",
  "Late 13th century",
  "Early 14th century",
  "Late 14th century",
  "Early 15th century",
  "Late 15th century",
  "Early 16th century",
  "Late 16th century"
];

const DATA_FILE = "listenings.json";

const el = {
  progress: document.getElementById("progress"),
  loadError: document.getElementById("loadError"),
  loadErrorMsg: document.getElementById("loadErrorMsg"),
  jsonPicker: document.getElementById("jsonPicker"),
  quiz: document.getElementById("quiz"),
  player: document.getElementById("player"),
  audioError: document.getElementById("audioError"),
  form: document.getElementById("answerForm"),
  title: document.getElementById("title"),
  composer: document.getElementById("composer"),
  period: document.getElementById("period"),
  genre: document.getElementById("genre"),
  titleVerdict: document.getElementById("titleVerdict"),
  composerVerdict: document.getElementById("composerVerdict"),
  periodVerdict: document.getElementById("periodVerdict"),
  genreVerdict: document.getElementById("genreVerdict"),
  checkBtn: document.getElementById("checkBtn"),
  revealBtn: document.getElementById("revealBtn"),
  nextBtn: document.getElementById("nextBtn"),
  result: document.getElementById("result"),
  summary: document.getElementById("summary"),
  summaryTitle: document.getElementById("summaryTitle"),
  summaryBody: document.getElementById("summaryBody"),
  newRoundBtn: document.getElementById("newRoundBtn")
};

let items = [];
let order = [];
let position = 0;
let round = 1;
let checked = false;
let lastItemIndex = -1;
let tally = freshTally();

function freshTally() {
  return { title: 0, composer: 0, period: 0, genre: 0, full: 0, answered: 0 };
}

/* ---------- Answer matching ---------- */

// Lowercase, strip accents, and drop spaces and punctuation so
// "Du Fay", "dufay" and "Léonin"/"leonin" all compare equal.
function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
    }
  }
  return prev[b.length];
}

// Exact match after normalizing, or a small typo allowance on longer answers.
function matchesAny(input, accepted) {
  const typed = normalize(input);
  if (!typed) return false;
  return accepted.some(answer => {
    const target = normalize(answer);
    if (!target) return false;
    if (typed === target) return true;
    const allowedEdits = target.length >= 10 ? 2 : target.length >= 5 ? 1 : 0;
    return allowedEdits > 0 && editDistance(typed, target) <= allowedEdits;
  });
}

function composerAnswers(item) {
  const list = Array.isArray(item.composerAccept) ? item.composerAccept.slice() : [];
  if (item.composer) {
    list.push(item.composer);
    const words = String(item.composer).trim().split(/\s+/);
    list.push(words[words.length - 1]);
  }
  return list;
}

function genreAnswers(item) {
  const list = Array.isArray(item.genreAccept) ? item.genreAccept.slice() : [];
  if (item.genre) list.push(item.genre);
  return list;
}

// Accepts the title with or without the catalog number, the "Gloria, Missa ..."
// wrapper, the word "Missa", or any one part of a slash-separated motet title.
// Add "titleAccept" in the JSON for anything else (alternate titles, short forms).
function titleAnswers(item) {
  const list = Array.isArray(item.titleAccept) ? item.titleAccept.slice() : [];
  const base = String(item.title).replace(/\s*\([^)]*\)/g, "").trim();
  list.push(base);
  base.split("/").forEach(part => list.push(part.trim()));
  const withoutMovement = base.replace(/^(Kyrie|Gloria|Credo|Sanctus|Agnus Dei),\s*/i, "");
  list.push(withoutMovement);
  list.push(withoutMovement.replace(/^Missa\s+/i, ""));
  return list.filter(Boolean);
}

/* ---------- Order and rounds ---------- */

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildOrder() {
  order = shuffle(items.map((_, i) => i));
  // Don't open a new round with the piece that just ended the last one.
  if (order.length > 1 && order[0] === lastItemIndex) {
    const last = order.length - 1;
    [order[0], order[last]] = [order[last], order[0]];
  }
  position = 0;
}

function startRound() {
  tally = freshTally();
  buildOrder();
  el.summary.hidden = true;
  el.quiz.hidden = false;
  showCurrent();
}

/* ---------- Showing a piece ---------- */

function showCurrent() {
  const item = items[order[position]];
  checked = false;

  el.progress.textContent =
    "Round " + round + ", piece " + (position + 1) + " of " + order.length;

  el.audioError.hidden = true;
  el.player.pause();
  el.player.src = item.audio;
  el.player.load();

  el.form.reset();
  el.period.selectedIndex = 0;
  setFieldsDisabled(false);
  for (const id of ["titleVerdict", "composerVerdict", "periodVerdict", "genreVerdict"]) {
    el[id].textContent = "";
    el[id].className = "verdict";
  }
  el.result.hidden = true;
  el.result.replaceChildren();

  el.checkBtn.disabled = false;
  el.revealBtn.disabled = false;
  el.nextBtn.disabled = true;
  el.nextBtn.textContent = position === order.length - 1 ? "Finish round" : "Next piece";
  el.title.focus();
}

function setFieldsDisabled(disabled) {
  el.title.disabled = disabled;
  el.composer.disabled = disabled;
  el.period.disabled = disabled;
  el.genre.disabled = disabled;
}

function setVerdict(node, ok, message) {
  node.textContent = message;
  node.className = "verdict " + (ok ? "good" : "bad");
}

/* ---------- Checking ---------- */

function check(giveUp) {
  const item = items[order[position]];

  const typedTitle = el.title.value;
  const typedComposer = el.composer.value;
  const typedGenre = el.genre.value;
  const chosenPeriod = el.period.value;

  if (!giveUp && !typedTitle.trim() && !typedComposer.trim() && !typedGenre.trim() && !chosenPeriod) {
    setVerdict(el.titleVerdict, false, "Enter at least one answer, or choose Show answer.");
    return;
  }

  const titleOk = !giveUp && matchesAny(typedTitle, titleAnswers(item));
  const composerOk = !giveUp && matchesAny(typedComposer, composerAnswers(item));
  const periodOk = !giveUp && chosenPeriod === item.period;
  const genreOk = !giveUp && matchesAny(typedGenre, genreAnswers(item));

  setVerdict(el.titleVerdict, titleOk,
    titleOk ? "Correct." : "Not quite. Answer: " + item.title);
  setVerdict(el.composerVerdict, composerOk,
    composerOk ? "Correct." : "Not quite. Answer: " + item.composer);
  setVerdict(el.periodVerdict, periodOk,
    periodOk ? "Correct." : "Not quite. Answer: " + item.period);
  setVerdict(el.genreVerdict, genreOk,
    genreOk ? "Correct." : "Not quite. Answer: " + item.genre);

  tally.answered += 1;
  if (titleOk) tally.title += 1;
  if (composerOk) tally.composer += 1;
  if (periodOk) tally.period += 1;
  if (genreOk) tally.genre += 1;
  if (titleOk && composerOk && periodOk && genreOk) tally.full += 1;

  renderResult(item, titleOk && composerOk && periodOk && genreOk);

  checked = true;
  setFieldsDisabled(true);
  el.checkBtn.disabled = true;
  el.revealBtn.disabled = true;
  el.nextBtn.disabled = false;
  el.nextBtn.focus();
}

function renderResult(item, allCorrect) {
  const heading = document.createElement("h2");
  heading.textContent = allCorrect ? "All four correct" : "Here is the full answer";

  const list = document.createElement("dl");
  const rows = [
    ["Piece", item.title],
    ["Composer", item.composer],
    ["Period", item.period],
    ["Genre", item.genre]
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  }

  el.result.append(heading, list);

  if (item.notes) {
    const notes = document.createElement("p");
    notes.className = "notes";
    notes.textContent = item.notes;
    el.result.append(notes);
  }
  el.result.hidden = false;
}

/* ---------- Moving on ---------- */

function next() {
  if (!checked) return;
  lastItemIndex = order[position];
  if (position + 1 >= order.length) {
    showSummary();
    return;
  }
  position += 1;
  showCurrent();
}

function showSummary() {
  el.player.pause();
  el.quiz.hidden = true;
  el.summary.hidden = false;
  const total = order.length;
  el.progress.textContent = "Round " + round + " finished";
  el.summaryTitle.textContent = "Round " + round + " finished";
  el.summaryBody.textContent =
    "All four fields correct: " + tally.full + " of " + total + ". " +
    "Title " + tally.title + "/" + total + ", " +
    "composer " + tally.composer + "/" + total + ", " +
    "period " + tally.period + "/" + total + ", " +
    "genre " + tally.genre + "/" + total + ". " +
    "The next round plays every piece again in a new random order.";
  el.newRoundBtn.textContent = "Start round " + (round + 1);
  el.newRoundBtn.focus();
}

/* ---------- Setup ---------- */

function fillPeriodMenu() {
  el.period.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a period";
  el.period.append(placeholder);
  for (const label of PERIODS) {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    el.period.append(option);
  }
}

function validate(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("The file must contain a non-empty list of pieces.");
  }
  data.forEach((item, i) => {
    for (const key of ["audio", "title", "composer", "period", "genre"]) {
      if (!item[key]) {
        throw new Error("Entry " + (i + 1) + " is missing \"" + key + "\".");
      }
    }
    if (!PERIODS.includes(item.period)) {
      throw new Error(
        "Entry " + (i + 1) + " (" + item.title + ") has period \"" + item.period +
        "\", which isn't in the dropdown list. Use exactly one of: " + PERIODS.join(", ") + "."
      );
    }
  });
  return data;
}

function begin(data) {
  items = validate(data);
  el.loadError.hidden = true;
  round = 1;
  lastItemIndex = -1;
  startRound();
}

function showLoadError(message) {
  el.progress.textContent = "No data loaded";
  el.loadErrorMsg.textContent = message;
  el.loadError.hidden = false;
}

async function loadFromFetch() {
  try {
    const response = await fetch(DATA_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    begin(await response.json());
  } catch (error) {
    showLoadError(error.message);
  }
}

el.jsonPicker.addEventListener("change", async () => {
  const file = el.jsonPicker.files[0];
  if (!file) return;
  try {
    begin(JSON.parse(await file.text()));
  } catch (error) {
    showLoadError(error.message);
  }
});

el.form.addEventListener("submit", event => {
  event.preventDefault();
  if (checked) next();
  else check(false);
});

el.revealBtn.addEventListener("click", () => check(true));
el.nextBtn.addEventListener("click", next);
el.newRoundBtn.addEventListener("click", () => {
  round += 1;
  startRound();
});

el.player.addEventListener("error", () => {
  const item = items[order[position]];
  el.audioError.textContent =
    "Couldn't load the audio file \"" + (item ? item.audio : "") +
    "\". Check that it is in the audio folder and the name in listenings.json matches exactly.";
  el.audioError.hidden = false;
});

fillPeriodMenu();
loadFromFetch();