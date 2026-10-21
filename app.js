// Almanca Öğren: every lesson runs the same four steps.
//   1. Öğren      new words in groups of five, each with picture, meaning and sound
//   2. Alıştırma  one easy question per word, straight after its group
//   3. Sınav      a mixed quiz on the whole lesson; first-try answers earn the stars
//   4. Cümleler   build short German sentences from word tiles
// A wrong answer is never punished: the right answer is shown and the question comes
// back a little later. Content lives in data.js; progress is kept in localStorage.
"use strict";

const VERSION = "Sürüm 7"; // shown on the home page, to tell which copy is running
const STORE_KEY = "almanca-oyunu-v1";
const GROUP_SIZE = 5;
const QUIZ_SIZE = 12;
const REVIEW_SIZE = 15;
const NEXT_DELAY_MS = 5000; // how long a right answer stays on screen before moving on
const PRAISE = ["Harika!", "Süper!", "Aferin!", "Çok iyi!", "Bravo!", "Mükemmel!"];
const ARTICLE_RE = /^(der|die|das) (.+)$/;

// ---------------------------------------------------------------- helpers

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "style") node.style.cssText = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const article = (w) => (ARTICLE_RE.exec(w.de) || [])[1] || null;
const bare = (w) => (ARTICLE_RE.exec(w.de) || [])[2] || w.de;

// The word to spell or type: the noun without its article, a single word, or an
// explicit "spell"; phrases have none.
function spellWord(w) {
  if (w.spell) return w.spell;
  const word = bare(w);
  return /^[A-Za-zÄÖÜäöüß-]+$/.test(word) ? word : null;
}

// Lenient comparison for typed answers: case, spaces, ß/ss and ä/ae all count as equal.
function norm(s) {
  return s.toLowerCase().trim().replace(/\s+/g, " ")
    .replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
}

// The German word with its article coloured: der blue, die red, das green.
function deNode(w, cls = "de") {
  const art = article(w);
  return el("span", { class: cls, lang: "de" },
    art ? el("span", { class: `art-${art}` }, art + " ") : null, bare(w));
}

function picNode(w, small) {
  if (w.sw) return el("div", { class: small ? "swatch small" : "swatch", style: `background:${w.sw}` });
  const isText = /^[0-9]+$/.test(w.pic);
  if (small) return el("span", { class: "opic" }, w.pic);
  return el("div", { class: isText ? "bigpic text" : "bigpic" }, w.pic);
}

// ---------------------------------------------------------------- storage

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { stars: data.stars || {}, unlockAll: !!data.unlockAll };
  } catch (e) {
    return { stars: {}, unlockAll: false };
  }
}

function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* storage blocked: progress lasts this visit only */ }
}

let progress = loadProgress();

// ---------------------------------------------------------------- speech

const Speech = {
  ok: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  voice: null,
  init() {
    if (!this.ok) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.voice = voices.find((v) => v.lang === "de-DE")
        || voices.find((v) => (v.lang || "").toLowerCase().startsWith("de")) || null;
      if (screen === "home") renderHome();
    };
    pick();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", pick);
  },
  say(text) {
    if (!this.ok) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ""));
      u.lang = "de-DE";
      if (this.voice) u.voice = this.voice;
      u.rate = 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* no sound is fine */ }
  },
};

function speakButton(text, huge) {
  if (!Speech.ok) return null;
  return el("button", {
    class: huge ? "speak huge" : "speak", "aria-label": "Dinle", title: "Dinle",
    onclick: () => Speech.say(text),
  }, "🔊");
}

// ---------------------------------------------------------------- screens

const app = document.getElementById("app");
let screen = "home";
let session = null;

function show(...nodes) {
  app.replaceChildren(...nodes.filter((n) => n != null && n !== false));
  window.scrollTo(0, 0);
}

function isUnlocked(index) {
  if (progress.unlockAll || index === 0) return true;
  return (progress.stars[LESSONS[index - 1].id] || 0) > 0;
}

function starText(n, max = 3) {
  return "⭐".repeat(n) + "☆".repeat(max - n);
}

function renderHome() {
  screen = "home";
  session = null;
  const done = LESSONS.filter((l) => progress.stars[l.id] > 0);
  const total = LESSONS.reduce((sum, l) => sum + (progress.stars[l.id] || 0), 0);

  const cards = LESSONS.map((lesson, i) => {
    const open = isUnlocked(i);
    const stars = progress.stars[lesson.id] || 0;
    return el("button", { class: "lesson", disabled: !open, onclick: () => startLesson(lesson) },
      el("span", { class: "head" },
        el("span", { class: "pic" }, open ? lesson.pic : "🔒"),
        el("span", { class: "num" }, `${i + 1}. ders`)),
      el("span", { class: "name" }, lesson.title),
      el("span", { class: "stars" }, stars ? starText(stars) : open ? "Yeni!" : ""));
  });
  // After two lessons, a mixed review sits in the header beside the star count.
  const review = done.length >= 2
    ? el("button", { class: "btn review", onclick: startReview, title: "Bitirdiğin derslerden karışık sorular" }, "🔁 Karışık Tekrar")
    : null;

  const soundNote = !Speech.ok
    ? "Bu tarayıcı sesli okumayı desteklemiyor; oyun sessiz çalışacak."
    : !Speech.voice
      ? "Bu cihazda Almanca ses bulunamadı, bu yüzden dinleme soruları atlanacak. Chrome ya da Edge'de genellikle Almanca ses vardır."
      : null;

  show(
    el("div", { class: "home-head" },
      el("h1", {}, "🥨 Almanca Öğren"),
      el("div", { class: "row" }, review, el("span", { class: "total" }, `⭐ ${total} / ${LESSONS.length * 3}`))),
    el("p", { class: "intro" }, "Almancayı adım adım öğren! Her derste önce yeni kelimeleri tanıyacak, sonra alıştırma yapacak, küçük bir sınavla yıldız toplayacak ve en sonunda cümle kuracaksın. Bir dersi bitirince sıradaki açılır."),
    soundNote ? el("p", { class: "muted" }, soundNote) : null,
    el("div", { class: "lessons" }, cards),
    el("div", { class: "parent" },
      el("label", {},
        el("input", {
          type: "checkbox", checked: progress.unlockAll,
          onchange: (e) => { progress.unlockAll = e.target.checked; saveProgress(); renderHome(); },
        }),
        "Ebeveyn: tüm dersleri aç"),
      el("button", {
        class: "linkish",
        onclick: () => {
          if (confirm("Tüm yıldızlar silinsin mi?")) { progress = { stars: {}, unlockAll: false }; saveProgress(); renderHome(); }
        },
      }, "İlerlemeyi sıfırla"),
      el("span", { class: "muted" }, VERSION)),
  );
}

// ---------------------------------------------------------------- building a lesson

// Wrong options for a question: other words from the same lesson, with distinct text.
function distractors(word, count, textOf) {
  const seen = new Set([textOf(word)]);
  const out = [];
  for (const other of shuffle(word.lesson.words)) {
    const text = textOf(other);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(other);
    if (out.length === count) break;
  }
  return out;
}

function withLesson(lesson) {
  return lesson.words.map((w) => ({ ...w, lesson }));
}

function groupsOf(words) {
  const groups = [];
  for (let i = 0; i < words.length; i += GROUP_SIZE) groups.push(words.slice(i, i + GROUP_SIZE));
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.length < 3) groups[groups.length - 2].push(...groups.pop());
  return groups;
}

// Question types a word can take in the quiz, in an order that spreads them out.
function quizTypes(w) {
  const types = ["pick-de"];
  if (Speech.voice) types.push("listen");
  if (article(w)) types.push("article");
  const spell = spellWord(w);
  if (spell && spell.length <= 10) types.push("spell");
  types.push("pick-tr");
  if (spell && spell.length <= 12) types.push("type");
  return types;
}

const QUIZ_ORDER = ["pick-de", "listen", "article", "spell", "pick-tr", "type"];

function buildQuiz(words, size, phase) {
  const chosen = shuffle(words).slice(0, size);
  return chosen.map((w, i) => {
    const allowed = quizTypes(w);
    for (let k = 0; k < QUIZ_ORDER.length; k++) {
      const type = QUIZ_ORDER[(i + k) % QUIZ_ORDER.length];
      if (allowed.includes(type)) return { kind: "q", type, word: w, options: 4, quiz: true, phase };
    }
    return { kind: "q", type: "pick-de", word: w, options: 4, quiz: true, phase };
  });
}

function startLesson(lesson) {
  const words = withLesson(lesson);
  const steps = [];
  const groups = groupsOf(words);
  groups.forEach((group, g) => {
    steps.push({
      kind: "stage", phase: "📚 Öğren", icon: "📚",
      title: groups.length > 1 ? `Yeni kelimeler (${g + 1}/${groups.length})` : "Yeni kelimeler",
      text: "Her kelimeye bak, dinle ve yüksek sesle tekrar et. Sonra küçük bir alıştırma yapacağız.",
    });
    group.forEach((w) => steps.push({ kind: "learn", word: w, phase: "📚 Öğren" }));
    shuffle(group).forEach((w, i) => steps.push({ kind: "q", type: i % 2 ? "pick-tr" : "pick-de", word: w, options: 3, phase: "✏️ Alıştırma" }));
  });
  steps.push({
    kind: "stage", phase: "🏆 Sınav", icon: "🏆", title: "Sınav zamanı!",
    text: "Bu dersteki kelimelerden karışık sorular. İlk denemede doğru bildiğin her soru yıldız kazandırır. Acele yok!",
  });
  steps.push(...buildQuiz(words, QUIZ_SIZE, "🏆 Sınav"));
  steps.push({
    kind: "stage", phase: "🧩 Cümleler", icon: "🧩", title: "Son bölüm: Cümleler",
    text: "Türkçe cümleyi oku. Almanca kelimelere doğru sırayla dokunarak cümleyi kur.",
  });
  shuffle(lesson.sentences).forEach((s) => steps.push({ kind: "sentence", sentence: s, phase: "🧩 Cümleler" }));
  runSession({ lesson, steps });
}

function startReview() {
  const words = LESSONS.filter((l) => progress.stars[l.id] > 0).flatMap(withLesson);
  runSession({ lesson: null, steps: buildQuiz(words, REVIEW_SIZE, "🔁 Karışık Tekrar") });
}

function runSession({ lesson, steps }) {
  screen = "lesson";
  session = { lesson, steps, i: 0, quizTotal: steps.filter((s) => s.quiz).length, quizRight: 0 };
  if (lesson) renderIntro(lesson);
  else renderStep();
}

function renderIntro(lesson) {
  const index = LESSONS.indexOf(lesson);
  show(
    frame(0),
    split(
      [el("div", { class: "bigpic" }, lesson.pic),
        el("p", { class: "muted" }, `${index + 1}. ders`),
        el("h1", {}, lesson.title),
        el("p", {}, `${lesson.words.length} yeni kelime ve ${lesson.sentences.length} cümle.`)],
      [el("div", { class: "steps" },
        el("span", {}, "📚 Öğren"), el("span", {}, "✏️ Alıştır"), el("span", {}, "🏆 Sınav"), el("span", {}, "🧩 Cümleler")),
      el("div", { class: "tipbox" }, el("strong", {}, "💡 İpucu: "), lesson.tip),
      el("button", { class: "btn big", onclick: renderStep }, "Başla!")]),
  );
}

// A card in two columns on wide screens: what the child looks at on the left, what
// they do on the right. On narrow screens the columns stack.
function split(prompt, answer) {
  return el("div", { class: "card split" },
    el("div", { class: "prompt" }, prompt),
    el("div", { class: "answer" }, answer));
}

// The bar and close button at the top of every lesson screen.
function frame(fraction, withBack) {
  return el("div", { class: "top" },
    el("button", { class: "close", "aria-label": "Ana sayfaya dön", title: "Ana sayfaya dön", onclick: renderHome }, "✕"),
    withBack ? el("button", { class: "back", "aria-label": "Önceki karta dön", title: "Önceki karta dön", onclick: previous }, "◀ Geri") : null,
    el("div", { class: "bar" }, el("div", { style: `width:${Math.round(fraction * 100)}%` })));
}

// Go back one card. A question that was already answered can be answered again, but
// it does not count twice and is not queued again (see settle). From the first card,
// back returns to the lesson's start screen.
function previous() {
  if (session.i > 0) {
    session.i -= 1;
    renderStep();
  } else if (session.lesson) {
    renderIntro(session.lesson);
  }
}

function next() {
  session.i += 1;
  renderStep();
}

// Put a missed question back a few steps later so the child meets it again.
function requeue(step) {
  const copy = { ...step, quiz: false, retry: true, settled: false };
  const at = Math.min(session.i + 4, session.steps.length);
  session.steps.splice(at, 0, copy);
}

function renderStep() {
  const step = session.steps[session.i];
  if (!step) return renderEnd();
  // Cards have ◀ Geri next to their forward button; questions get it in the top bar.
  const backOnTop = (step.kind === "q" || step.kind === "sentence") && (session.i > 0 || session.lesson);
  const header = [frame(session.i / session.steps.length, backOnTop), el("div", { class: "phase" }, step.phase)];
  if (step.kind === "stage") return renderStage(step, header);
  if (step.kind === "learn") return renderLearn(step, header);
  if (step.kind === "sentence") return renderSentence(step, header);
  return renderQuestion(step, header);
}

// The buttons under a card: ◀ Geri (when there is somewhere to go back to) and the
// main forward button.
function navButtons(label) {
  const canGoBack = session.i > 0 || session.lesson;
  return el("div", { class: "nav" },
    canGoBack ? el("button", { class: "btn secondary", onclick: previous }, "◀ Geri") : null,
    el("button", { class: "btn", onclick: next }, label));
}

function renderStage(step, header) {
  show(...header,
    split(
      [el("div", { class: "bigpic" }, step.icon)],
      [el("h2", {}, step.title), el("p", {}, step.text), navButtons("Hazırım!")]));
}

function renderLearn(step, header) {
  const w = step.word;
  show(...header,
    split(
      [picNode(w)],
      [deNode(w),
        el("div", { class: "tr" }, w.tr),
        w.note ? el("div", { class: "note" }, w.note) : null,
        speakButton(w.de),
        navButtons("Sıradaki ▶")]));
  Speech.say(w.de);
}

// ---------------------------------------------------------------- questions

// Praise a right answer, then move on after NEXT_DELAY_MS, or sooner with the button.
function feedbackRight(box, after, ...extra) {
  let done = false;
  const here = session, step = session.i;
  // Only move on if the child is still on this question (not back on the home page).
  const go = () => { if (!done && session === here && session.i === step) { done = true; clearTimeout(timer); after(); } };
  const back = () => { done = true; clearTimeout(timer); previous(); };
  const timer = setTimeout(go, NEXT_DELAY_MS);
  box.replaceChildren(el("div", { class: "feedback correct" },
    el("div", {}, `${pickOne(PRAISE)} 🎉 `, ...extra),
    el("div", { class: "nav" },
      el("button", { class: "btn secondary", onclick: back }, "◀ Geri"),
      el("button", { class: "btn", onclick: go }, "Devam ▶"))));
}

function feedbackWrong(box, answerNode, after, ...extra) {
  const go = el("button", { class: "btn", onclick: after }, "Devam ▶");
  box.replaceChildren(el("div", { class: "feedback wrong" },
    el("div", {}, "Neredeyse! Doğrusu: ", answerNode), ...extra,
    el("div", { class: "nav" }, el("button", { class: "btn secondary", onclick: previous }, "◀ Geri"), go)));
  go.focus();
}

// Settle a question: count it, give feedback, and move on.
function settle(step, right, box) {
  const w = step.word;
  const first = !step.settled; // false when the child came back to it with ◀ Geri
  step.settled = true;
  if (right && step.quiz && first) session.quizRight += 1;
  if (right) {
    Speech.say(w.de);
    feedbackRight(box, next);
  } else {
    if (first) requeue(step);
    Speech.say(w.de);
    // Give the answer in the language of the buttons: Turkish when the child was
    // choosing a meaning, German otherwise. Show the pair too, so it sticks.
    const turkish = step.type === "pick-tr" || step.type === "listen";
    feedbackWrong(box, turkish ? w.tr : deNode(w, ""), next,
      turkish ? el("div", { style: "font-weight:normal;margin-top:6px" }, deNode(w, ""), ` = ${w.tr}`) : null);
  }
}

function renderQuestion(step, header) {
  const w = step.word;
  const box = el("div");
  let prompt = [];
  let answer = [];
  let finished = false;
  const once = (fn) => (...args) => { if (!finished) { finished = true; fn(...args); } };

  // Multiple choice: options are word objects; the right one is the question's word.
  function choices(textOf, renderOpt, n) {
    const opts = shuffle([w, ...distractors(w, n - 1, textOf)]);
    const buttons = opts.map((o) => el("button", { class: "opt" }, renderOpt(o)));
    buttons.forEach((b, k) => b.addEventListener("click", once(() => {
      const right = textOf(opts[k]) === textOf(w);
      buttons.forEach((x, j) => {
        x.disabled = true;
        if (textOf(opts[j]) === textOf(w)) x.classList.add("correct");
      });
      if (!right) b.classList.add("wrong");
      settle(step, right, box);
    })));
    return el("div", { class: "options" }, buttons);
  }

  if (step.type === "pick-de") {
    prompt = [el("div", { class: "question" }, "Almancası hangisi?"), picNode(w), el("div", { class: "tr" }, w.tr)];
    answer = [choices((o) => o.de, (o) => deNode(o, ""), step.options)];
  } else if (step.type === "pick-tr") {
    prompt = [el("div", { class: "question" }, "Bu ne demek?"), deNode(w), speakButton(w.de)];
    answer = [choices((o) => o.tr, (o) => o.tr, step.options)];
    Speech.say(w.de);
  } else if (step.type === "listen") {
    prompt = [el("div", { class: "question" }, "Dinle ve doğru resmi seç!"), speakButton(w.de, true)];
    answer = [choices((o) => o.tr, (o) => [picNode(o, true), el("span", { class: "otr" }, o.tr)], step.options)];
    setTimeout(() => Speech.say(w.de), 300);
  } else if (step.type === "article") {
    const art = article(w);
    const buttons = ["der", "die", "das"].map((a) => el("button", { class: `opt art ${a}` }, a));
    buttons.forEach((b, k) => b.addEventListener("click", once(() => {
      const chosen = ["der", "die", "das"][k];
      buttons.forEach((x, j) => {
        x.disabled = true;
        if (["der", "die", "das"][j] === art) x.classList.add("correct");
      });
      if (chosen !== art) b.classList.add("wrong");
      settle(step, chosen === art, box);
    })));
    prompt = [el("div", { class: "question" }, "Artikeli hangisi: der, die, das?"),
      picNode(w), el("div", { class: "de", lang: "de" }, bare(w)), el("div", { class: "tr" }, w.tr)];
    answer = [el("div", { class: "options" }, buttons)];
  } else if (step.type === "spell") {
    prompt = [el("div", { class: "question" }, "Harfleri sırayla dizerek kelimeyi yaz!"), picNode(w), el("div", { class: "tr" }, w.tr)];
    answer = [spellPuzzle(step, box, once)];
  } else if (step.type === "type") {
    prompt = [el("div", { class: "question" }, "Almancasını yaz!"), picNode(w), el("div", { class: "tr" }, w.tr)];
    answer = [typingBox(step, box, once)];
  }
  show(...header, split(prompt, [...answer, box]));
}

function spellPuzzle(step, box, once) {
  const w = step.word;
  const target = spellWord(w);
  const letters = [...target];
  let order = shuffle(letters.map((_, i) => i));
  if (letters.length > 1 && order.every((v, i) => letters[v] === letters[i])) order = order.reverse();
  const placed = [];
  const slots = el("div", { class: "slots" });
  const tiles = el("div", { class: "tiles" });
  const tileButtons = order.map((li) => el("button", { class: "tile", lang: "de" }, letters[li]));

  const draw = () => {
    slots.replaceChildren(...letters.map((_, s) => {
      const t = placed[s];
      return el("button", {
        class: t == null ? "slot" : "slot filled",
        onclick: () => { if (t == null || finished) return; placed.splice(s, 1); tileButtons[t].disabled = false; draw(); },
      }, t == null ? "" : letters[order[t]]);
    }));
  };
  let finished = false;
  tileButtons.forEach((b, t) => b.addEventListener("click", () => {
    if (finished) return;
    placed.push(t);
    b.disabled = true;
    draw();
    if (placed.length === letters.length) {
      finished = true;
      const word = placed.map((p) => letters[order[p]]).join("");
      const right = word === target;
      if (right) slots.classList.add("correct");
      once(() => settle(step, right, box))();
    }
  }));
  tiles.append(...tileButtons);
  draw();
  const art = article(w);
  return el("div", {},
    art ? el("div", { class: `de art-${art}` }, art) : null,
    slots, tiles);
}

function typingBox(step, box, once) {
  const w = step.word;
  const target = spellWord(w);
  const art = article(w);
  const input = el("input", {
    type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    lang: "de", "aria-label": "Cevabın",
  });
  const check = once(() => {
    input.disabled = true;
    settle(step, norm(input.value) === norm(target), box);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) check(); });
  const add = (ch) => { input.value += ch; input.focus(); };
  setTimeout(() => input.focus(), 50);
  return el("div", {},
    el("div", { class: "typing" },
      art ? el("span", { class: `art-label art-${art}` }, art) : null,
      w.spell ? el("span", { class: "art-label" }, "ich") : null,
      input),
    el("div", { class: "umlauts" }, ["ä", "ö", "ü", "ß"].map((ch) => el("button", { onclick: () => add(ch) }, ch))),
    el("div", { style: "margin-top:16px" },
      el("button", { class: "btn", onclick: () => { if (input.value.trim()) check(); } }, "Kontrol et")));
}

// ---------------------------------------------------------------- sentences

function renderSentence(step, header) {
  const s = step.sentence;
  const words = s.de.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean);
  let order = shuffle(words.map((_, i) => i));
  if (words.length > 1 && order.every((v, i) => words[v] === words[i])) order = order.reverse();
  const placed = [];
  const line = el("div", { class: "answer-line" });
  const box = el("div");
  let finished = false;
  const tileButtons = order.map((wi) => el("button", { class: "tile word", lang: "de" }, words[wi]));

  const draw = () => {
    line.replaceChildren(...placed.map((t, k) => el("button", {
      class: "tile word", lang: "de",
      onclick: () => { if (finished) return; placed.splice(k, 1); tileButtons[t].disabled = false; draw(); },
    }, words[order[t]])));
  };
  tileButtons.forEach((b, t) => b.addEventListener("click", () => {
    if (finished) return;
    placed.push(t);
    b.disabled = true;
    draw();
    if (placed.length === words.length) {
      finished = true;
      const right = placed.map((p) => words[order[p]]).join(" ") === words.join(" ");
      Speech.say(s.de);
      if (right) {
        line.classList.add("correct");
        step.settled = true;
        feedbackRight(box, next, el("span", { lang: "de" }, s.de));
      } else {
        if (!step.retry && !step.settled) requeue(step);
        step.settled = true;
        feedbackWrong(box, el("span", { lang: "de" }, s.de), next);
      }
    }
  }));
  draw();
  show(...header,
    split(
      [el("div", { class: "question" }, "Bu cümleyi Almanca kur:"),
        el("div", { class: "sentence-tr" }, `“${s.tr}”`)],
      [line, el("div", { class: "tiles" }, tileButtons), box]));
}

// ---------------------------------------------------------------- the end

function renderEnd() {
  const { lesson, quizTotal, quizRight } = session;
  const ratio = quizTotal ? quizRight / quizTotal : 1;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;
  const head = [frame(1)];

  if (!lesson) {
    show(...head, el("div", { class: "card center" },
      el("div", { class: "bigpic" }, "🔁"),
      el("h2", {}, "Tekrar bitti!"),
      el("p", {}, `${quizTotal} sorunun ${quizRight} tanesini ilk denemede bildin.`),
      el("button", { class: "btn big", onclick: renderHome }, "Ana sayfa")));
    return;
  }

  const before = progress.stars[lesson.id] || 0;
  progress.stars[lesson.id] = Math.max(before, stars);
  saveProgress();
  const index = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[index + 1];
  const message = stars === 3 ? "Muhteşem! Bu dersi çok iyi öğrendin!"
    : stars === 2 ? "Çok iyi! Biraz daha tekrar edersen üç yıldız senin!"
      : "Dersi bitirdin! Tekrar oynarsan daha çok yıldız kazanabilirsin.";

  show(...head, el("div", { class: "card center" },
    el("div", { class: "bigpic" }, "🎉"),
    el("h2", {}, "Tebrikler!"),
    el("p", {}, `“${lesson.title}” dersini bitirdin.`),
    el("div", { class: "bigstars" },
      [1, 2, 3].map((n) => el("span", { class: n <= stars ? "" : "dim" }, "⭐"))),
    el("p", {}, `Sınavda ${quizTotal} sorunun ${quizRight} tanesini ilk denemede bildin.`),
    el("p", {}, message),
    el("div", { class: "row", style: "justify-content:center" },
      el("button", { class: "btn secondary", onclick: () => startLesson(lesson) }, "Tekrar oyna"),
      nextLesson ? el("button", { class: "btn", onclick: () => startLesson(nextLesson) }, "Sonraki ders ▶") : null,
      el("button", { class: "btn secondary", onclick: renderHome }, "Ana sayfa"))));
}

// ---------------------------------------------------------------- start

Speech.init();
renderHome();
