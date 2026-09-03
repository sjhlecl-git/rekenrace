/* ============================================================
   RekenRace v3 — app.js
   ============================================================ */

"use strict";

// ─── supabase test ────────────────────────────────────────────
async function testSupabaseConnection() {
  try {

    console.log("window.supabase =", window.supabase);
    console.log("window.supabaseClient =", window.supabaseClient);
    console.log("from =", window.supabaseClient?.from);

    const { data, error } = await window.supabaseClient
      .from("profiles")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);
      return;
    }

    console.log("✅ Connected to Supabase");
    console.log(data);

  } catch (err) {
    console.error("Connection failed:", err);
  }
}

//-----------------migration ---------------
async function migrateProfilesToSupabase() {

    const createdPins = [];

    for (const profile of state.profiles) {

      if (!profile.pin) {
        profile.pin = generatePin();
      }

      await saveProfileToSupabase(profile);

      createdPins.push(
        `${profile.naam}: ${profile.pin}`
      );
    }

    saveState();

    alert(
      "Migratie voltooid!\n\n" +
      createdPins.join("\n")
    );
  }

// ─── save profile to supabase ────────────────────────────────────────────
async function saveProfileToSupabase(profile) {
  const { error } = await window.supabaseClient
    .from("profiles")
    .upsert(
      {
        username: profile.naam,
        pin: profile.pin,
        profile_data: profile
      },
      {
        onConflict: "username"
      }
    );

  if (error) {
    console.error("Save failed:", error);
  } else {
    console.log("✅ Profile saved:", profile.naam);
  }
}

// ─── load profile from supabase ────────────────────────────────────────────
async function loadProfilesFromSupabase() {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("*");

  if (error) {
    console.error("Load failed:", error);
    return [];
  }

  return data;
}


// ─── delete a profile in supabase ────────────────────────────────────────────
async function deleteProfileFromSupabase(profileName) {

  const { error } = await window.supabaseClient
    .from("profiles")
    .delete()
    .eq("username", profileName);

  if (error) {
    console.error("Delete failed:", error);
  } else {
    console.log("✅ Profile deleted");
  }
}

// ─── validate pin in supabase ────────────────────────────────────────────
async function validatePin(username, pin) {
  const { data, error } =
    await window.supabaseClient
      .from("profiles")
      .select("*")
      .eq("username", username)
      .eq("pin", pin)
      .single();

  if (error) {
    return null;
  }

  return data;
}

// ─── Storage key ────────────────────────────────────────────
const STORAGE_KEY = "rekenrace_v3";

// ___ preconfigured backgrounds etc. _________
let configuredBackgrounds = [];
let configuredCharacters = [];

// ─── IndexedDB helpers (large binary assets) ─────────────────
// Binary data (images, audio) is too large for localStorage (~5 MB limit).
// We store blobs in IndexedDB (no practical size limit) and keep only metadata
// in localStorage. On page load, blobs are fetched back from IndexedDB.
const IDB_NAME  = "rekenrace_v3_blobs";
const IDB_STORE = "blobs";
let _idb = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (_idb) { resolve(_idb); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess       = (e) => { _idb = e.target.result; resolve(_idb); };
    req.onerror         = (e) => reject(e.target.error);
  });
}

async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** After loadState(), populate binary fields from IndexedDB.
 *  Also migrates any legacy data that was previously saved in localStorage. */
async function loadBlobsFromIDB() {
  for (const theme of state.admin.uploadedThemes) {
    if (theme.customImage) {
      // Legacy: binary was stored in localStorage — migrate it to IDB
      await idbSet(theme.id, theme.customImage).catch(console.error);
      // Keep value in memory; next saveState() will strip it from localStorage
    } else {
      theme.customImage = await idbGet(theme.id) || null;
    }
  }
  for (const track of state.admin.uploadedTracks) {
    if (track.src) {
      await idbSet(track.id, track.src).catch(console.error);
    } else {
      track.src = await idbGet(track.id) || "";
    }
  }
  for (const char of state.admin.uploadedCharacters) {
    if (char.src) {
      await idbSet(char.id, char.src).catch(console.error);
    } else {
      char.src = await idbGet(char.id) || null;
    }
  }
}

// ─── Stage configuration ────────────────────────────────────
const STAGES = [
  {
    id: "stage-1",
    label: "Beginner",
    emoji: "🌱",
    color: "#2f9d45",
    tables: [1, 2, 10],
    comboTables: [1, 2, 10],
    bonusTablesCumulative: [1, 2, 10],
  },
  {
    id: "stage-2",
    label: "Sommenbaas",
    emoji: "💪",
    color: "#0085c7",
    tables: [3, 5],
    comboTables: [3, 5],
    bonusTablesCumulative: [1, 2, 10, 3, 5],
  },
  {
    id: "stage-3",
    label: "Rekenheld",
    emoji: "🦸",
    color: "#7b2fa0",
    tables: [4, 6],
    comboTables: [4, 6],
    bonusTablesCumulative: [1, 2, 10, 3, 5, 4, 6],
  },
  {
    id: "stage-4",
    label: "Tafel Expert",
    emoji: "🔥",
    color: "#e07000",
    tables: [7, 8],
    comboTables: [7, 8],
    bonusTablesCumulative: [1, 2, 10, 3, 5, 4, 6, 7, 8],
  },
  {
    id: "stage-5",
    label: "Keersommen Kampioen!",
    emoji: "🏆",
    color: "#c0392b",
    tables: [9, 11, 12],
    comboTables: [9, 11, 12],
    bonusTablesCumulative: [1, 2, 10, 3, 5, 4, 6, 7, 8, 9, 11, 12],
  },
];

// ─── Plus-Min stage configuration ───────────────────────────
const PM_STAGES = [
  {
    id:              "pm-stage-1",
    label:           "Beginnen tot 10",
    emoji:           "🌱",
    color:           "#2f9d45",
    levels:          ["pm-add-to5", "pm-add-to10"],
    comboLevels:     ["pm-add-to5", "pm-add-to10"],
    bonusCumulative: ["pm-add-to5", "pm-add-to10"],
  },
  {
    id:              "pm-stage-2",
    label:           "Spring over de 10",
    emoji:           "🐸",
    color:           "#0085c7",
    levels:          ["pm-add-over10", "pm-add-to100-exact"],
    comboLevels:     ["pm-add-over10", "pm-add-to100-exact"],
    bonusCumulative: ["pm-add-to5", "pm-add-to10", "pm-add-over10", "pm-add-to100-exact"],
  },
  {
    id:              "pm-stage-3",
    label:           "Minnen tot 10",
    emoji:           "➖",
    color:           "#7b2fa0",
    levels:          ["pm-sub-to10", "pm-sub-from10"],
    comboLevels:     ["pm-sub-to10", "pm-sub-from10"],
    bonusCumulative: ["pm-add-to5", "pm-add-to10", "pm-add-over10", "pm-add-to100-exact", "pm-sub-to10", "pm-sub-from10"],
  },
  {
    id:              "pm-stage-4",
    label:           "Plus tot 20",
    emoji:           "🚀",
    color:           "#e07000",
    levels:          ["pm-add-to20", "pm-add-to20-all"],
    comboLevels:     ["pm-add-to20", "pm-add-to20-all"],
    bonusCumulative: ["pm-add-to5", "pm-add-to10", "pm-add-over10", "pm-add-to100-exact", "pm-sub-to10", "pm-sub-from10", "pm-add-to20", "pm-add-to20-all"],
  },
  {
    id:              "pm-stage-5",
    label:           "Minnen tot 20",
    emoji:           "🏆",
    color:           "#c0392b",
    levels:          ["pm-sub-to20", "pm-sub-to20-borrow"],
    comboLevels:     ["pm-sub-to20", "pm-sub-to20-borrow"],
    bonusCumulative: ["pm-add-to5", "pm-add-to10", "pm-add-over10", "pm-add-to100-exact", "pm-sub-to10", "pm-sub-from10", "pm-add-to20", "pm-add-to20-all", "pm-sub-to20", "pm-sub-to20-borrow"],
  },
];

// Display labels for Plus-Min level keys
const PM_LEVEL_LABELS = {
  "pm-add-to5":         "Plussen tot 5",
  "pm-add-to10":        "Plussen tot 10",
  "pm-add-over10":      "Springen 🐸",
  "pm-add-to100-exact": "Naar 100 🔥",
  "pm-sub-to10":        "Minnen onder de 10 ➖",
  "pm-sub-from10":      "Verliefde van 10 ❤️",
  "pm-add-to20":        "Plussen 10-20 ➕",
  "pm-add-to20-all":    "Plussen tot 20 🚀",
  "pm-sub-to20":        "Minnen 20-10 ➖",
  "pm-sub-to20-borrow": "Moeilijke minnen 💪",
};

// Time limits (seconds)
const TIME_LIMITS = {
  "table-1":       90,
  "table-default": 100,
  combo:           120,
  bonus:           200,
  uitdagingen:     150,
};

// Coin rewards per level type
const COIN_REWARDS = {
  table: 10,
  combo: 25,
  bonus: 60,
};

// Coins earned per new badge
const BADGE_COIN_REWARD = 10;

// Base themes
// const BASE_THEMES = [
//   { id: "classic", naam: "Classic",        prijs: 0,   cssTheme: "classic", customImage: null },
//   { id: "ocean",   naam: "Oceaan",          prijs: 100, cssTheme: "ocean",   customImage: null },
//   { id: "sunset",  naam: "Zonsondergang",   prijs: 150, cssTheme: "sunset",  customImage: null },
//   { id: "forest",  naam: "Bos",             prijs: 200, cssTheme: "forest",  customImage: null },
//   { id: "space",   naam: "Ruimte",          prijs: 300, cssTheme: "space",   customImage: null },
// ];

const BASE_MUSIC = [
  { id: "silent", naam: "Geen muziek", prijs: 0, src: "" },
];

// ─── Application state ──────────────────────────────────────
let state = {
  profiles: [],
  activeProfileId: null,
  musicMuted: false,
  runsAllTime: [],          // eligible leaderboard runs only
  speedChampions: {},       // levelId → { profileId, profileName, timeMs }
  admin: {
    password: "wiekendreef",
    unlocked: false,
    devUnlockShop: false,
    uploadedThemes: [],
    uploadedTracks: [],
    uploadedCharacters: [],
    customTimeLimits: {},
  },
};

// Active game session
let game = {
  active: false,
  paused: false,
  wasEverPaused: false,
  mode: "challenge",      // "challenge" | "practice"
  stageId: null,
  levelKey: null,         // "table-1", "combo", "bonus"
  levelType: null,        // "table" | "combo" | "bonus"
  levelId: null,          // e.g. "stage-1.table-1"
  questions: [],
  currentIndex: 0,
  mistakes: 0,
  startedAtMs: 0,
  pausedAccumulatedMs: 0,
  pauseStartedMs: 0,
  timerIntervalId: null,
};

// Currently selected mode in stage map
let selectedMode = "challenge";

// ─── Utility ────────────────────────────────────────────────

async function loadConfiguredBackgrounds() {
    try {
        const response = await fetch("config/backgrounds.json");

        if (!response.ok) {
            console.warn("Geen backgrounds.json gevonden");
            return;
        }

        const data = await response.json();

        configuredBackgrounds = data.map(item => ({
            id: item.id,
            naam: item.naam,
            prijs: item.prijs,
            cssTheme: "classic",
            customImage: item.bestand,
            builtIn: true
        }));

    } catch (err) {
        console.error("Kon backgrounds.json niet laden", err);
    }
}

async function loadConfiguredCharacters() {
    try {
        const response = await fetch("config/characters.json");

        if (!response.ok) {
            console.warn("Geen characters.json gevonden");
            return;
        }

        const data = await response.json();

        configuredCharacters = data.map(item => ({
            id: item.id,
            naam: item.naam,
            prijs: item.prijs,
            src: item.src,
            builtIn: true
        }));

    } catch (err) {
        console.error("Kon characters.json niet laden", err);
    }
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

/** Escape HTML to prevent XSS when building innerHTML strings */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Level helpers ───────────────────────────────────────────
function getLevelId(stageId, levelKey) {
  return `${stageId}.${levelKey}`;
}

function getLevelType(levelKey) {
  if (levelKey === "combo")  return "combo";
  if (levelKey === "bonus")  return "bonus";
  return "table";
}

function getLevelLabel(stageId, levelKey) {
  if (levelKey === "combo") {
    const stage = findStage(stageId);
    if (stage?.tables) return `Mix ${stage.comboTables.join(", ")}`;
    return "Mix \u2795\u2796";
  }
  if (levelKey === "bonus") return "Bonus";
  if (PM_LEVEL_LABELS[levelKey]) return PM_LEVEL_LABELS[levelKey];
  const n = levelKey.replace("table-", "");
  return `Tafel ${n}`;
}

function getTimeLimitSeconds(levelKey) {
  const custom = state.admin?.customTimeLimits?.[levelKey];
  if (typeof custom === "number" && custom > 0) return custom;
  if (levelKey === "uitdagingen") return TIME_LIMITS.uitdagingen;
  if (levelKey === "combo")       return TIME_LIMITS.combo;
  if (levelKey === "bonus")       return TIME_LIMITS.bonus;
  if (levelKey === "table-1")     return TIME_LIMITS["table-1"];
  return TIME_LIMITS["table-default"];
}

function getQuestionCount(levelType) {
  return levelType === "bonus" ? 40 : 20;
}

// ─── Default progress structures ───────────────────────────
function defaultLevelProgress() {
  return {
    mastered: false,
    bestTimeMs: null,
    runs: [],
    badges: [],
    coinsClaimedRun: false,
    perfectCount: 0,
  };
}

function defaultStageProgress(stageId) {
  const stage = findStage(stageId);
  const levels = {};
  for (const key of getStageLevelKeys(stage)) {
    levels[key] = defaultLevelProgress();
  }
  levels.combo = defaultLevelProgress();
  levels.bonus = defaultLevelProgress();
  return {
    levels,
    completed: false,
    bonusMastered: false,
    stageBadges: [],
  };
}

function defaultProfile(naam, pin) {
  const stageProgress = {};
  for (const s of getAllStages()) {
    stageProgress[s.id] = defaultStageProgress(s.id);
  }
  return {
    id: uid(),
    naam,
    pin,
    coins: 0,
    gameMode: "keersommen",
    unlockedThemeIds: ["classic"],
    selectedThemeId: "classic",
    unlockedTrackIds: ["silent"],
    selectedTrackId: "silent",
    selectedCharacterId: null,
    recentMistakes: [],
    stageProgress,
  };
}

/** Safely fill in any missing keys from an older/partial profile */
function normalizeProfile(p) {
  const profile = { ...p };
  if (typeof profile.coins !== "number")               profile.coins = 0;
  if (!Array.isArray(profile.unlockedThemeIds))        profile.unlockedThemeIds = ["classic"];
  if (!profile.unlockedThemeIds.includes("classic"))   profile.unlockedThemeIds.unshift("classic");
  if (!Array.isArray(profile.unlockedTrackIds))        profile.unlockedTrackIds = ["silent"];
  if (!profile.unlockedTrackIds.includes("silent"))    profile.unlockedTrackIds.unshift("silent");
  if (!profile.selectedThemeId)                        profile.selectedThemeId = "classic";
  if (!profile.selectedTrackId)                        profile.selectedTrackId = "silent";
  if (!Array.isArray(profile.recentMistakes))          profile.recentMistakes = [];
  if (profile.selectedCharacterId === undefined)       profile.selectedCharacterId = null;
  if (!Array.isArray(profile.unlockedCharacterIds))    profile.unlockedCharacterIds = [];
  if (!profile.gameMode)                               profile.gameMode = "keersommen";
  if (!profile.id)                                     profile.id = uid();
  if (!profile.naam)                                   profile.naam = "Speler";

  if (!profile.stageProgress || typeof profile.stageProgress !== "object") {
    profile.stageProgress = {};
  }
  for (const stage of getAllStages()) {
    if (!profile.stageProgress[stage.id]) {
      profile.stageProgress[stage.id] = defaultStageProgress(stage.id);
    } else {
      const sp = profile.stageProgress[stage.id];
      if (!sp.levels)              sp.levels = {};
      if (!Array.isArray(sp.stageBadges)) sp.stageBadges = [];
      if (typeof sp.completed !== "boolean") sp.completed = false;
      if (typeof sp.bonusMastered !== "boolean") sp.bonusMastered = false;
      for (const key of getStageLevelKeys(stage)) {
        if (!sp.levels[key]) sp.levels[key] = defaultLevelProgress();
      }
      if (!sp.levels.combo) sp.levels.combo = defaultLevelProgress();
      if (!sp.levels.bonus) sp.levels.bonus = defaultLevelProgress();
      // Ensure each level has all fields
      for (const lp of Object.values(sp.levels)) {
        if (typeof lp.mastered !== "boolean")   lp.mastered = false;
        if (typeof lp.bestTimeMs !== "number" && lp.bestTimeMs !== null) lp.bestTimeMs = null;
        if (!Array.isArray(lp.runs))            lp.runs = [];
        if (!Array.isArray(lp.badges))          lp.badges = [];
        if (typeof lp.coinsClaimedRun !== "boolean") lp.coinsClaimedRun = false;
        if (typeof lp.perfectCount !== "number") lp.perfectCount = 0;
      }
    }
  }
  return profile;
}

// ─── Persistence ────────────────────────────────────────────
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.profiles       = (Array.isArray(parsed.profiles) ? parsed.profiles : []).map(normalizeProfile);
    state.activeProfileId = parsed.activeProfileId || null;
    state.runsAllTime    = Array.isArray(parsed.runsAllTime) ? parsed.runsAllTime : [];
    state.speedChampions = (parsed.speedChampions && typeof parsed.speedChampions === "object")
      ? parsed.speedChampions : {};
    state.admin = {
      password:          parsed.admin?.password || "wiekendreef",
      unlocked:          false,
      devUnlockShop:     Boolean(parsed.admin?.devUnlockShop),
      uploadedThemes:      Array.isArray(parsed.admin?.uploadedThemes)     ? parsed.admin.uploadedThemes     : [],
      uploadedTracks:      Array.isArray(parsed.admin?.uploadedTracks)     ? parsed.admin.uploadedTracks     : [],
      uploadedCharacters:  Array.isArray(parsed.admin?.uploadedCharacters) ? parsed.admin.uploadedCharacters : [],
      customTimeLimits:    (parsed.admin?.customTimeLimits && typeof parsed.admin.customTimeLimits === "object") ? parsed.admin.customTimeLimits : {},
    };
    state.musicMuted = Boolean(parsed.musicMuted);
  } catch (err) {
    console.error("Kon opslag niet lezen:", err);
  }
}

function saveState() {
  const toSave = {
    profiles:       state.profiles,
    activeProfileId: state.activeProfileId,
    musicMuted:     state.musicMuted,
    runsAllTime:    state.runsAllTime,
    speedChampions: state.speedChampions,
    admin: {
      password:          state.admin.password,
      devUnlockShop:     state.admin.devUnlockShop,
      // Strip binary data — blobs are stored in IndexedDB, not localStorage
      uploadedThemes:      state.admin.uploadedThemes.map(({ id, naam, prijs, cssTheme }) => ({ id, naam, prijs, cssTheme })),
      uploadedTracks:      state.admin.uploadedTracks.map(({ id, naam, prijs }) => ({ id, naam, prijs })),
      uploadedCharacters:  state.admin.uploadedCharacters.map(({ id, naam, prijs }) => ({ id, naam, prijs })),
      customTimeLimits:    state.admin.customTimeLimits,
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.error("Opslaan mislukt (opslag vol?):", err);
    const toast = document.createElement("div");
    toast.className = "save-error-toast";
    toast.textContent = "\u26a0\ufe0f Opslaan mislukt \u2014 bestand mogelijk te groot voor lokale opslag.";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }
}

// ─── Profile helpers ─────────────────────────────────────────
function getActiveProfile() {
  return state.profiles.find((p) => p.id === state.activeProfileId) || null;
}

function getLevelProgress(profile, stageId, levelKey) {
  return profile?.stageProgress?.[stageId]?.levels?.[levelKey] || null;
}

// ─── Unlock logic ────────────────────────────────────────────
function isStageMandatoryComplete(profile, stageId) {
  const stage = findStage(stageId);
  if (!stage) return false;
  const sp = profile.stageProgress?.[stageId];
  if (!sp) return false;
  for (const key of getStageLevelKeys(stage)) {
    if (!sp.levels[key]?.mastered) return false;
  }
  return Boolean(sp.levels.combo?.mastered);
}

function isStageUnlocked(profile, stageId) {
  const stages = stageId.startsWith("pm-") ? PM_STAGES : STAGES;
  const idx = stages.findIndex((s) => s.id === stageId);
  if (idx === 0) return true;
  return isStageMandatoryComplete(profile, stages[idx - 1].id);
}

function isLevelUnlocked(profile, stageId, levelKey) {
  if (!isStageUnlocked(profile, stageId)) return false;
  if (levelKey === "bonus") return isStageMandatoryComplete(profile, stageId);
  return true;
}

// Map stages to color themes (lowest unlocked = first entry)
const STAGE_THEMES = ["classic", "ocean", "sunset", "forest", "space"];

function getStageTheme(profile) {
  if (!profile) return "classic";
  const stages = getStagesForMode(profile.gameMode);
  let highest = 0;
  for (let i = 0; i < stages.length; i++) {
    if (isStageUnlocked(profile, stages[i].id)) highest = i;
    else break;
  }
  return STAGE_THEMES[Math.min(highest, STAGE_THEMES.length - 1)];
}

// ─── Stage/mode helpers ─────────────────────────────────────────
function getAllStages()       { return [...STAGES, ...PM_STAGES]; }
function findStage(stageId)  { return getAllStages().find((s) => s.id === stageId) || null; }
function getStageLevelKeys(stage) {
  return stage.tables ? stage.tables.map((t) => `table-${t}`) : (stage.levels || []);
}
function getStagesForMode(mode) {
  return mode === "plusmin" ? PM_STAGES : STAGES;
}

function getAllCharacters() {
  return state.admin.uploadedCharacters;
}

// ─── Question generation ──────────────────────────────────────
function generateQuestions(stageId, levelKey) {
  if (stageId && stageId.startsWith("pm-")) return generatePmQuestions(stageId, levelKey);
  const type  = getLevelType(levelKey);
  const count = getQuestionCount(type);
  const stage = STAGES.find((s) => s.id === stageId);
  let tables;
  if (type === "table") {
    tables = [Number(levelKey.replace("table-", ""))];
  } else if (type === "combo") {
    tables = stage.comboTables;
  } else {
    tables = stage.bonusTablesCumulative;
  }
  const qs = [];
  let lastText = null;
  for (let i = 0; i < count; i++) {
    let a, b, text;
    let attempts = 0;
    do {
      a = tables[randomInt(0, tables.length - 1)];
      b = randomInt(1, 10);
      text = `${a} × ${b}`;
      attempts++;
    } while (text === lastText && attempts < 20);
    lastText = text;
    qs.push({ id: uid(), text, answer: a * b, status: "pending", userAnswer: null });
  }
  return qs;
}

// ─── Plus-Min question generators ────────────────────────────
/** Returns an array of [a, b, op] tuples valid for the given PM level key. */
function buildPmPool(levelKey) {
  const pairs = [];
  switch (levelKey) {
    case "pm-add-to5":
      for (let a = 0; a <= 5; a++)
        for (let b = 0; b <= 5; b++)
          if (a + b <= 5) pairs.push([a, b, "+"]);
      break;
    case "pm-add-to10":
      for (let a = 0; a <= 10; a++)
        for (let b = 0; b <= 10; b++)
          if (a + b <= 10) pairs.push([a, b, "+"]);
      break;
    case "pm-add-to100-exact":
      for (let a = 0; a <= 100; a += 10)
        for (let b = 0; b <= 100; b += 10)
          if (a + b <= 100) pairs.push([a, b, "+"]);
      break;
    case "pm-add-over10":
      for (let a = 0; a <= 10; a++)
        for (let b = 0; b <= 10; b++)
          if (a + b > 10 && a + b <= 20) pairs.push([a, b, "+"]);
      break;
    case "pm-sub-to10":
      for (let a = 1; a <= 10; a++)
        for (let b = 0; b < a; b++)
          pairs.push([a, b, "-"]);
      break;
    case "pm-sub-from10":
      for (let b = 1; b <= 9; b++) pairs.push([10, b, "-"]);
      break;
    case "pm-add-to20":
      for (let a = 10; a <= 20; a++)
        for (let b = 0; b <= 10; b++)
          if (a + b <= 20 && (a % 10) + b <= 10) pairs.push([a, b, "+"]);
      break;
    case "pm-add-to20-all":
      for (let a = 0; a <= 20; a++)
        for (let b = 0; b <= 20; b++)
          if (a + b > 10 && a + b <= 20) pairs.push([a, b, "+"]);
      break;
    case "pm-sub-to20":
      for (let a = 11; a <= 19; a++)
        for (let b = 1; b <= 9; b++)
          if (b <= a % 10) pairs.push([a, b, "-"]);
      break;
    case "pm-sub-to20-borrow":
      for (let a = 11; a <= 19; a++)
        for (let b = 1; b <= 10; b++)
          if (b > a % 10) pairs.push([a, b, "-"]);
      break;
    default:
      for (let a = 1; a <= 5; a++) pairs.push([a, a, "+"]);
  }
  return pairs;
}

function generatePmQuestions(stageId, levelKey) {
  const stage = PM_STAGES.find((s) => s.id === stageId);
  const type  = getLevelType(levelKey);
  const count = getQuestionCount(type);
  let pool;
  if (type === "table") {
    pool = buildPmPool(levelKey);
  } else if (type === "combo") {
    pool = stage.comboLevels.flatMap((lk) => buildPmPool(lk));
  } else {
    pool = stage.bonusCumulative.flatMap((lk) => buildPmPool(lk));
  }
  const qs = [];
  let lastText = null;
  for (let i = 0; i < count; i++) {
    let entry, text, attempts = 0;
    do {
      entry   = pool[randomInt(0, pool.length - 1)];
      text    = `${entry[0]} ${entry[2]} ${entry[1]}`;
      attempts++;
    } while (text === lastText && attempts < 20);
    lastText = text;
    const [a, b, op] = entry;
    qs.push({ id: uid(), text, answer: op === "+" ? a + b : a - b, status: "pending", userAnswer: null });
  }
  return qs;
}

// ─── Timer ───────────────────────────────────────────────────
function elapsedMs() {
  const now = Date.now();
  let ms = now - game.startedAtMs - game.pausedAccumulatedMs;
  if (game.paused && game.pauseStartedMs) ms -= now - game.pauseStartedMs;
  return Math.max(0, ms);
}

function startTimer() {
  clearInterval(game.timerIntervalId);
  game.timerIntervalId = setInterval(updateTimerUI, 100);
}

function stopTimer() {
  clearInterval(game.timerIntervalId);
  game.timerIntervalId = null;
}

function updateTimerUI() {
  const el = document.getElementById("timerDisplay");
  if (!el) return;
  if (game.mode === "practice") {
    el.textContent = "📖 Oefenmodus";
    el.dataset.warning  = "false";
    el.dataset.overtime = "false";
    return;
  }
  const sec   = elapsedMs() / 1000;
  const limit = getTimeLimitSeconds(game.levelKey);
  const remaining = limit - sec;
  el.textContent = `⏱️ ${sec.toFixed(1)}s / ${limit}s`;
  el.dataset.warning  = remaining < 10 && remaining > 0 ? "true" : "false";
  el.dataset.overtime = sec > limit ? "true" : "false";
}

// ─── Audio ────────────────────────────────────────────────────
function tone(freq, ms, type = "sine") {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, ms);
  } catch (_) {}
}

function playCorrectSound()  { tone(660, 80); setTimeout(() => tone(880, 100), 75); }
function playWrongSound()    { tone(200, 180, "sawtooth"); }
function playCompleteSound() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 180), i * 140)); }
function playMasterySound()  { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 200), i * 110)); }

// ─── View switching ──────────────────────────────────────────
function showView(which) {
  const map  = document.getElementById("stageMapView");
  const play = document.getElementById("gameView");
  if (map)  map.classList.toggle("hidden", which !== "stageMap");
  if (play) play.classList.toggle("hidden", which !== "game");
}

function openTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.getElementById(`tab-${name}`)?.classList.remove("hidden");
}

// ─── Small UI updates ────────────────────────────────────────
function updateCoinBadge() {
  const profile = getActiveProfile();
  const el = document.getElementById("coinCount");
  if (el) el.textContent = profile ? profile.coins : 0;
}

function updateProfileBadge() {
  const profile = getActiveProfile();
  const el = document.getElementById("profileBtnName");
  if (el) el.textContent = profile ? profile.naam : "Kies profiel";
}

function showFeedback(text, type) {
  const el = document.getElementById("feedbackText");
  if (!el) return;
  el.textContent = text;
  el.className = `feedback-text feedback-${type}`;
  if (type === "wrong") {
    el.classList.remove("shake");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("shake");
  }
}

// ─── Stage map ───────────────────────────────────────────────
function renderStageMap() {
  const profile   = getActiveProfile();
  const container = document.getElementById("stageList");
  if (!container) return;

  if (!profile) {
    container.innerHTML = '<p class="hint">Selecteer eerst een profiel om te spelen.</p>';
    return;
  }

  container.innerHTML = "";

  const stages = getStagesForMode(profile.gameMode);

  for (const stage of stages) {
    const unlocked   = isStageUnlocked(profile, stage.id);
    const mandatory  = isStageMandatoryComplete(profile, stage.id);
    const sp         = profile.stageProgress[stage.id];

    const stageEl    = document.createElement("div");
    stageEl.className = `stage-card${unlocked ? "" : " locked"}${mandatory ? " completed" : ""}`;

    // Header
    const header = document.createElement("div");
    header.className = "stage-header";
    header.innerHTML =
      `<span class="stage-emoji">${unlocked ? stage.emoji : "🔒"}</span>` +
      `<span class="stage-name">${escHtml(stage.label)}</span>` +
      (sp.stageBadges.includes("StageCompleted")  ? `<span class="stage-badge-pill">✅ Voltooid</span>` : "") +
      (sp.stageBadges.includes("StageBonusMaster") ? `<span class="stage-badge-pill">🌟 Bonus meester</span>` : "");
    stageEl.append(header);

    if (!unlocked) {
      const msg = document.createElement("p");
      msg.className = "lock-msg";
      msg.textContent = "Voltooi de vorige stage om dit vrij te spelen!";
      stageEl.append(msg);
    } else {
      const row = document.createElement("div");
      row.className = "levels-row";
      for (const key of getStageLevelKeys(stage)) {
        row.append(makeLevelCard(profile, stage.id, key, stage));
      }
      row.append(makeLevelCard(profile, stage.id, "combo", stage));
      row.append(makeLevelCard(profile, stage.id, "bonus", stage));
      stageEl.append(row);
    }

    container.append(stageEl);
  }
}

function badgeEmoji(badge) {
  const map = {
    LevelPerfectCompleted: "🏅",
    LevelTriplePerfect:    "🥉",
    LevelSpeedChampion:    "⚡",
  };
  return map[badge] || "🎖️";
}

const BADGE_TOOLTIPS = {
  LevelPerfectCompleted: "🏅 Eerste perfecte run (0 fouten + binnen tijd)",
  LevelTriplePerfect:    "🥉 3× perfect voltooid",
  LevelSpeedChampion:    "⚡ Snelste tijd over alle spelers",
  StageCompleted:        "✅ Alle verplichte levels van de stage behaald",
  StageBonusMaster:      "🌟 Bonus level van de stage behaald",
};

function badgeTooltip(badge) {
  return BADGE_TOOLTIPS[badge] || badge;
}

function makeLevelCard(profile, stageId, levelKey, stage) {
  const unlocked = isLevelUnlocked(profile, stageId, levelKey);
  const lp       = getLevelProgress(profile, stageId, levelKey);
  const mastered = lp?.mastered || false;
  const type     = getLevelType(levelKey);

  const card     = document.createElement("button");
  card.type      = "button";
  card.className = [
    "level-card",
    mastered        ? "mastered" : "",
    !unlocked       ? "locked"   : "",
    `level-type-${type}`,
  ].filter(Boolean).join(" ");
  card.disabled  = !unlocked;

  const icon     = mastered ? "⭐" : unlocked ? (type === "bonus" ? "🎁" : "🎯") : "🔒";
  const label    = getLevelLabel(stageId, levelKey);
  const bestTime = mastered && lp.bestTimeMs != null
    ? `<span class="level-time">⏱️ ${(lp.bestTimeMs / 1000).toFixed(1)}s</span>` : "";
  const badgeMini = (lp?.badges || []).length > 0
    ? `<span class="level-badges-mini">${lp.badges.map((b) => `<span class="badge-tip" title="${escHtml(badgeTooltip(b))}">${badgeEmoji(b)}</span>`).join("")}</span>` : "";
  const bonusTag = type === "bonus"
    ? `<span class="bonus-label">40 vragen</span>` : "";

  card.innerHTML =
    `<span class="level-icon">${icon}</span>` +
    `<span class="level-name">${escHtml(label)}</span>` +
    bestTime + badgeMini + bonusTag;

  if (unlocked) {
    card.addEventListener("click", () => startGame(stageId, levelKey));
  }
  return card;
}

// ─── Game: start ─────────────────────────────────────────────
function startGame(stageId, levelKey) {
  const profile = getActiveProfile();
  if (!profile)                               return;
  if (!isLevelUnlocked(profile, stageId, levelKey)) return;

  const type      = getLevelType(levelKey);
  const questions = generateQuestions(stageId, levelKey);

  game = {
    active: true,
    paused: false,
    wasEverPaused: false,
    mode:  selectedMode,
    stageId,
    levelKey,
    levelType: type,
    levelId: getLevelId(stageId, levelKey),
    questions,
    originalQuestionCount: questions.length,
    currentIndex: 0,
    mistakes: 0,
    startedAtMs: Date.now(),
    pausedAccumulatedMs: 0,
    pauseStartedMs: 0,
    timerIntervalId: null,
  };

  // Update UI elements
  const stage = findStage(stageId);
  const titleEl = document.getElementById("levelTitle");
  if (titleEl) titleEl.textContent = `${stage.emoji} ${getLevelLabel(stageId, levelKey)}`;

  const modePill = document.getElementById("modePill");
  if (modePill) {
    modePill.textContent = selectedMode === "challenge" ? "🏆 Challenge" : "📖 Oefenen";
    modePill.className   = `pill-mode ${selectedMode}`;
  }

  document.getElementById("pauseBanner")?.classList.add("hidden");
  document.getElementById("feedbackText").textContent = "";

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) pauseBtn.textContent = "⏸️ Pauze";

  const inp = document.getElementById("answerInput");
  if (inp) { inp.value = ""; inp.disabled = false; }

  showView("game");
  renderWorksheet();
  showCurrentQuestion();

  if (selectedMode === "challenge") {
    startTimer();
  } else {
    const timerEl = document.getElementById("timerDisplay");
    if (timerEl) { timerEl.textContent = "📖 Oefen rustig"; timerEl.dataset.warning = "false"; timerEl.dataset.overtime = "false"; }
  }

  setTimeout(() => document.getElementById("answerInput")?.focus(), 60);
}

// ─── Game: show current question ──────────────────────────────
function showCurrentQuestion() {
  const q = game.questions[game.currentIndex];
  if (!q) { void finishGame(); return; }

  const label = document.getElementById("questionLabel");
  if (label) {
    label.textContent = `${q.text} = ?`;
    label.classList.remove("flash-correct", "flash-wrong");
  }

  const inp = document.getElementById("answerInput");
  if (inp) {
    inp.value = "";
    if (!game.paused) setTimeout(() => inp.focus(), 20);
  }
}

// ─── Game: worksheet ─────────────────────────────────────────
function renderWorksheet() {
  const total         = game.questions.length;
  const originalTotal = game.originalQuestionCount || total;
  const remaining     = total - game.currentIndex;
  const pct           = total > 0 ? (game.currentIndex / total) * 100 : 0;
  const repeatCount   = Math.max(0, total - originalTotal);
  const repeatStartPct = total > 0 ? Math.min(100, (originalTotal / total) * 100) : 100;

  const fill = document.getElementById("progressFill");
  if (fill) fill.style.width = `${Math.min(100, pct)}%`;

  const repeatFill = document.getElementById("progressRepeat");
  if (repeatFill) {
    if (repeatCount > 0) {
      repeatFill.style.left  = `${repeatStartPct}%`;
      repeatFill.style.width = `${100 - repeatStartPct}%`;
      repeatFill.classList.remove("hidden");
    } else {
      repeatFill.classList.add("hidden");
    }
  }

  const remEl = document.getElementById("remainingDisplay");
  if (remEl) remEl.textContent = `📝 Nog ${remaining} / ${originalTotal}`;
}

// ─── Game: pause / resume ────────────────────────────────────
function pauseOrResume() {
  if (!game.active) return;

  if (!game.paused) {
    game.paused       = true;
    game.wasEverPaused = true;
    game.pauseStartedMs = Date.now();
    stopTimer();
    const inp = document.getElementById("answerInput");
    if (inp) inp.disabled = true;
    const btn = document.getElementById("pauseBtn");
    if (btn) btn.textContent = "▶️ Hervat";
    document.getElementById("pauseBanner")?.classList.remove("hidden");
    const modePill = document.getElementById("modePill");
    if (modePill) { modePill.textContent = "⏸️ Gepauzeerd"; }
  } else {
    game.paused = false;
    game.pausedAccumulatedMs += Date.now() - game.pauseStartedMs;
    game.pauseStartedMs = 0;
    const inp = document.getElementById("answerInput");
    if (inp) { inp.disabled = false; inp.focus(); }
    const btn = document.getElementById("pauseBtn");
    if (btn) btn.textContent = "⏸️ Pauze";
    document.getElementById("pauseBanner")?.classList.add("hidden");
    const modePill = document.getElementById("modePill");
    if (modePill) {
      modePill.textContent = game.mode === "challenge" ? "🏆 Challenge" : "📖 Oefenen";
      modePill.className   = `pill-mode ${game.mode}`;
    }
    if (game.mode === "challenge") startTimer();
  }
}

// ─── Game: reset / quit ──────────────────────────────────────
function resetGame() {
  if (!game.active) return;
  stopTimer();
  renderUitdagingen();
  startGame(game.stageId, game.levelKey);
}

function quitGame() {
  if (!game.active) return;
  stopTimer();
  game.active = false;
  game.paused = false;
  saveState();
  saveProfileToSupabase(profile);
  renderUitdagingen();
  showView("stageMap");
  renderStageMap();
}

// ─── Game: submit answer ─────────────────────────────────────
function submitAnswer() {
  if (!game.active || game.paused) return;

  const inp = document.getElementById("answerInput");
  if (!inp) return;
  const raw = inp.value.trim();
  if (!raw) { showFeedback("Typ een getal!", "info"); return; }
  const userValue = Number(raw);
  if (!Number.isFinite(userValue)) { showFeedback("Typ een getal!", "info"); return; }

  const q = game.questions[game.currentIndex];
  if (!q) { void finishGame(); return; }

  q.userAnswer = userValue;

  const label = document.getElementById("questionLabel");

  if (userValue === q.answer) {
    q.status = "correct";
    showFeedback("✅ Goed zo!", "correct");
    playCorrectSound();
    if (label) {
      label.classList.remove("flash-wrong");
      void label.offsetWidth;
      label.classList.add("flash-correct");
    }
  } else {
    q.status = "requeued";
    game.mistakes += 1;
    // Track recent mistakes per profile (keep last 10)
    const profileForMistake = getActiveProfile();
    if (profileForMistake) {
      if (!Array.isArray(profileForMistake.recentMistakes)) profileForMistake.recentMistakes = [];
      const prevMistakeCount = profileForMistake.recentMistakes.length;
      // Remove any existing entry for the same question (keep newest at front)
      profileForMistake.recentMistakes = profileForMistake.recentMistakes.filter((m) => m.question !== q.text);
      profileForMistake.recentMistakes.unshift({ question: q.text, answer: q.answer, given: userValue, ts: Date.now() });
      if (profileForMistake.recentMistakes.length > 50) profileForMistake.recentMistakes.length = 50;
      saveState();
      saveProfileToSupabase(profile);
      if (prevMistakeCount < 10 && profileForMistake.recentMistakes.length >= 10) {
        showToast("💪 10 uitdagingen bereikt! Ga naar het tabblad 💪 Uitdagingen om ze te oefenen.");
        updateUitdagingenBadge();
        renderUitdagingen(); // hier toegevoegd omdat dit een logisch moment is voor gebruiker om uitdagingen tabblad te openen
      }
    }
    showFeedback(`❌ Niet goed! ${q.text} = ${q.answer}`, "wrong");
    playWrongSound();
    // Re-queue the question at the end
    game.questions.push({
      id: uid(),
      text: q.text,
      answer: q.answer,
      status: "pending",
      userAnswer: null,
    });
    if (label) {
      label.classList.remove("flash-correct");
      void label.offsetWidth;
      label.classList.add("flash-wrong");
    }
  }

  game.currentIndex += 1;
  renderWorksheet();
  showCurrentQuestion();
}

// ─── Game: finish ────────────────────────────────────────────
async function finishGame() {
  if (!game.active) return;
  game.active = false;
  stopTimer();

  const profile = getActiveProfile();
  if (!profile) { showView("stageMap"); return; }

  // ── Special: Uitdagingen (mistakes practice) level ───────
  if (game.isMistakesChallenge) {
    const timeMs  = elapsedMs();
    const timeSec = timeMs / 1000;
    const limitSec = getTimeLimitSeconds("uitdagingen");
    const won = game.mistakes === 0 && timeSec <= limitSec;
    const coinsWon = won ? 20 : 0;
    if (won) {
      profile.coins += coinsWon;
      // Only remove the sommen that were actually used in this level
      const usedTexts = new Set((game.usedMistakes || []).map((m) => m.question));
      profile.recentMistakes = profile.recentMistakes.filter((m) => !usedTexts.has(m.question));
      saveState();
      await saveProfileToSupabase(profile);
    }
    await showResultScreen({
      isEffective:   true,
      isPractice:    false,
      isPauseRun:    game.wasEverPaused,
      timeSec,
      timeLimitSec:  limitSec,
      mistakes:      game.mistakes,
      perfectRun:    game.mistakes === 0,
      isNewMastery:  won,
      perfectButSlow: game.mistakes === 0 && timeSec > limitSec,
      claimCoins:    won,
      levelCoins:    coinsWon,
      badgeCoins:    0,
      totalCoins:    coinsWon,
      newBadges:     [],
      levelLabel:    "Uitdagingen",
      isMistakesChallenge: true,
      clearedList:   won,
    });
    showView("stageMap");
    renderUitdagingen();
    renderAll();
    return;
  }

  const timeMs  = game.mode === "challenge" ? elapsedMs() : 0;
  const timeSec = timeMs / 1000;

  // A challenge run is only "effective" if it was never paused
  const isEffective = game.mode === "challenge" && !game.wasEverPaused;
  const limitSec    = getTimeLimitSeconds(game.levelKey);

  const perfectRun   = game.mistakes === 0;
  const withinTime   = timeSec <= limitSec;
  const isNewMastery = isEffective && perfectRun && withinTime;

  const lp = getLevelProgress(profile, game.stageId, game.levelKey);

  // ── Update level progress ────────────────────────────────
  const runRecord = { id: uid(), timeMs, mistakes: game.mistakes, mode: game.mode, paused: game.wasEverPaused, playedAt: nowIso() };
  if (isEffective) {
    lp.runs.push(runRecord);
  }

  // Personal best time (challenge, non-pause)
  if (isEffective && (lp.bestTimeMs === null || timeMs < lp.bestTimeMs)) {
    lp.bestTimeMs = timeMs;
  }

  // Track perfect count for LevelTriplePerfect
  if (isEffective && perfectRun) {
    lp.perfectCount = (lp.perfectCount || 0) + 1;
  }

  // Mastery
  const masteryAlreadyHad = lp.mastered;
  if (isNewMastery) lp.mastered = true;

  // ── Coins (once per level, on new mastery) ───────────────
  let coinsEarned = 0;
  const claimCoins = isNewMastery && !lp.coinsClaimedRun;
  if (claimCoins) {
    lp.coinsClaimedRun = true;
    coinsEarned = COIN_REWARDS[game.levelType];
  }

  // ── Badges ───────────────────────────────────────────────
  const newBadges = [];

  if (isEffective) {
    // LevelPerfectCompleted — first ever perfect mastery on this level
    if (isNewMastery && !lp.badges.includes("LevelPerfectCompleted")) {
      lp.badges.push("LevelPerfectCompleted");
      newBadges.push({ badge: "LevelPerfectCompleted", label: "🏅 Eerste perfecte run!" });
    }
    // LevelTriplePerfect — after 3 perfect challenge runs
    if (lp.perfectCount >= 3 && !lp.badges.includes("LevelTriplePerfect")) {
      lp.badges.push("LevelTriplePerfect");
      newBadges.push({ badge: "LevelTriplePerfect", label: "🥇 Drie keer perfect!" });
    }
    // LevelSpeedChampion — fastest across all profiles
    const champion = state.speedChampions[game.levelId];
    if (!champion || timeMs < champion.timeMs) {
      // Remove badge from previous champion
      if (champion && champion.profileId !== profile.id) {
        const prevP = state.profiles.find((p) => p.id === champion.profileId);
        if (prevP) {
          const prevLp = getLevelProgress(prevP, game.stageId, game.levelKey);
          if (prevLp) {
            const idx = prevLp.badges.indexOf("LevelSpeedChampion");
            if (idx !== -1) prevLp.badges.splice(idx, 1);
          }
        }
      }
      state.speedChampions[game.levelId] = { profileId: profile.id, profileName: profile.naam, timeMs };
      const hadSpeedBadge = lp.badges.includes("LevelSpeedChampion");
      if (!hadSpeedBadge) lp.badges.push("LevelSpeedChampion");
      if (!hadSpeedBadge) newBadges.push({ badge: "LevelSpeedChampion", label: "⚡ Snelste kampioen!" });
    }
  }

  // ── Stage badges ─────────────────────────────────────────
  const sp = profile.stageProgress[game.stageId];
  if (isEffective) {
    if (isStageMandatoryComplete(profile, game.stageId) && !sp.completed) {
      sp.completed = true;
      if (!sp.stageBadges.includes("StageCompleted")) {
        sp.stageBadges.push("StageCompleted");
        newBadges.push({ badge: "StageCompleted", label: "✅ Stage voltooid!" });
      }
    }
    if (sp.completed && game.levelKey === "bonus" && lp.mastered && !sp.bonusMastered) {
      sp.bonusMastered = true;
      if (!sp.stageBadges.includes("StageBonusMaster")) {
        sp.stageBadges.push("StageBonusMaster");
        newBadges.push({ badge: "StageBonusMaster", label: "🌟 Bonus meester!" });
      }
    }
  }

  // ── Leaderboard run (challenge, non-pause) ───────────────
  if (isEffective) {
    state.runsAllTime.push({
      id:          uid(),
      levelId:     game.levelId,
      stageId:     game.stageId,
      levelKey:    game.levelKey,
      profileId:   profile.id,
      profileName: profile.naam,
      timeMs,
      mistakes:    game.mistakes,
      playedAt:    nowIso(),
    });
  }

  saveState();
  saveProfileToSupabase(profile);

  // ── Badge coins (5 per new badge, always in challenge non-pause) ───────
  const badgeCoins = isEffective ? newBadges.length * BADGE_COIN_REWARD : 0;
  const totalCoins = (claimCoins ? coinsEarned : 0) + badgeCoins;

  // ── Show result modal, then grant coins on dismiss ────────
  await showResultScreen({
    isEffective,
    isPractice:    game.mode === "practice",
    isPauseRun:    game.wasEverPaused,
    timeSec,
    timeLimitSec:  limitSec,
    mistakes:      game.mistakes,
    perfectRun,
    isNewMastery,
    perfectButSlow: isEffective && perfectRun && !withinTime,
    claimCoins,
    levelCoins:    claimCoins ? coinsEarned : 0,
    badgeCoins,
    totalCoins,
    newBadges,
    levelLabel:    getLevelLabel(game.stageId, game.levelKey),
  });

  // Grant coins only after user confirms the popup
  if (totalCoins > 0) {
    profile.coins += totalCoins;
    saveState();
    saveProfileToSupabase(profile);
  }

  showView("stageMap");
  renderAll();
}

// ─── Result modal ────────────────────────────────────────────
function showResultScreen(data) {
  return new Promise((resolve) => {
    const modal   = document.getElementById("resultModal");
    const content = document.getElementById("resultContent");
    if (!modal || !content) { resolve(); return; }

    // Play sound
    if (data.isNewMastery) playMasterySound();
    else                   playCompleteSound();

    // Header
    let headerClass, icon, title;
    if (data.isMistakesChallenge && data.isNewMastery) {
      headerClass = "mastery";   icon = "💪"; title = "Uitdagingen verslagen!";
    } else if (data.isMistakesChallenge) {
      headerClass = "done";      icon = "💪"; title = "Uitdagingen afgerond";
    } else if (data.isNewMastery) {
      headerClass = "mastery";   icon = "🌟"; title = "Level Beheerst!";
    } else if (data.perfectButSlow) {
      headerClass = "too-slow";  icon = "⏱️"; title = "Bijna! 0 fouten maar te langzaam";
    } else if (data.perfectRun && data.isEffective) {
      headerClass = "perfect";   icon = "🎉"; title = "Perfect!";
    } else if (data.isPauseRun) {
      headerClass = "paused";    icon = "⏸️"; title = "Gepauzeerd";
    } else if (data.isPractice) {
      headerClass = "done";      icon = "📖"; title = "Oefenronde klaar!";
    } else {
      headerClass = "done";      icon = "✅"; title = "Goed gedaan!";
    }

    // Build result HTML
    let html = `<div class="result-header ${headerClass}">
      <span class="result-big-icon">${icon}</span>
      <h2 id="resultHeading">${escHtml(title)}</h2>
    </div>`;

    // Stats
    html += `<div class="result-stats">`;
    if (data.isEffective) {
      html += `<div class="result-stat"><span>Tijd</span><strong>${data.timeSec.toFixed(1)}s</strong></div>`;
    }
    html += `<div class="result-stat"><span>Fouten</span><strong>${data.mistakes}</strong></div>`;
    html += `</div>`;

    // Notice for paused / practice / too slow / uitdagingen
    if (data.isPauseRun) {
      html += `<div class="result-notice">⚠️ Je had gepauzeerd — geen coins, badges of voortgang voor deze run.</div>`;
    } else if (data.isPractice) {
      html += `<div class="result-notice">📖 Oefenronde — geen coins of badges. Schakel over naar Challenge voor beloningen!</div>`;
    } else if (data.perfectButSlow) {
      html += `<div class="result-notice result-notice-slow">⏱️ Super — 0 fouten! Maar je deed er ${data.timeSec.toFixed(1)}s over (limiet: ${data.timeLimitSec}s). Probeer het sneller voor een ster en coins! 💪</div>`;
    } else if (data.isMistakesChallenge && data.clearedList) {
      html += `<div class="result-notice" style="background:var(--ok-bg);color:var(--ok)">🎉 Geweldig! Je hebt alle uitdagingen foutloos geoefend. Je lijstje is leeg!</div>`;
    } else if (data.isMistakesChallenge) {
      html += `<div class="result-notice">💪 Bijna! Probeer het opnieuw zonder fouten om je lijst leeg te maken en 20 coins te verdienen.</div>`;
    }

    // Coin claim — itemized breakdown
    if (data.totalCoins > 0) {
      html += `<div class="coin-claim-box">`;
      html += `<span class="coin-big">💰</span>`;
      html += `<div class="coin-breakdown">`;
      if (data.levelCoins > 0) {
        html += `<div class="coin-line">🏅 Level behaald: <strong>+${data.levelCoins}</strong></div>`;
      }
      data.newBadges.forEach((b) => {
        html += `<div class="coin-line">${escHtml(b.label)}: <strong>+${BADGE_COIN_REWARD}</strong></div>`;
      });
      html += `<div class="coin-total">Totaal: <strong>${data.totalCoins} coins</strong></div>`;
      html += `</div></div>`;
    }

    // New badges
    if (data.newBadges.length > 0) {
      html += `<div class="new-badges">`;
      data.newBadges.forEach((b, i) => {
        html += `<div class="new-badge-item" style="animation-delay:${i * 80}ms">${escHtml(b.label)}</div>`;
      });
      html += `</div>`;
    }

    const btnLabel = data.totalCoins > 0 ? "💰 Claim & Doorgaan" : "👍 Doorgaan";
    html += `<div class="result-close-wrap"><button id="resultCloseBtn" class="btn btn-primary btn-large">${btnLabel}</button></div>`;

    content.innerHTML = html;
    modal.classList.remove("hidden");

    document.getElementById("resultCloseBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      resolve();
    });
  });
}

// ─── Theme & music application ──────────────────────────────
function getAllThemes() {
    return [
        ...configuredBackgrounds,
        ...state.admin.uploadedThemes
    ];
}
function getAllTracks() {
  return [...BASE_MUSIC, 
          ...state.admin.uploadedTracks];
}

function getAllCharacters() {
  return [...configuredCharacters, 
          ...state.admin.uploadedCharacters];
}

function applyTheme(profile) {
  if (!profile) return;
  // Color scheme is automatic based on highest unlocked stage
  document.body.setAttribute("data-theme", getStageTheme(profile));
  // Background image from selected uploaded theme (if any)
  const uploadedTheme = getAllThemes().find((t) => t.id === profile.selectedThemeId);
  document.documentElement.style.setProperty(
    "--custom-image",
    uploadedTheme?.customImage ? `url('${uploadedTheme.customImage}')` : "none"
  );
}

function applyCharacter(profile) {
  const img = document.getElementById("characterImg");
  if (!img) return;
  if (!profile || !profile.selectedCharacterId) {
    img.src = "";
    img.classList.add("hidden");
    return;
  }

  const char = getAllCharacters().find((c) => c.id === profile.selectedCharacterId);
  if (char?.src) {
    img.src = char.src;
    img.classList.remove("hidden");
  } else {
    img.src = "";
    img.classList.add("hidden");
  }
}

function applyTrack(profile) {
  const player = document.getElementById("musicPlayer");
  if (!player) return;
  if (!profile) { player.pause(); return; }
  const track = getAllTracks().find((t) => t.id === profile.selectedTrackId) || BASE_MUSIC[0];
  player.src = track.src || "";
  player.muted = state.musicMuted;
  player.volume = 0.25;
  if (track.src) {
    player.load();
    void player.play().catch(() => {});
  } else {
    player.pause();
  }
}

function updateMusicToggleBtn() {
  const btn = document.getElementById("musicToggleBtn");
  if (!btn) return;
  const player = document.getElementById("musicPlayer");
  const hasTrack = player && player.src && player.src !== window.location.href;
  btn.textContent = state.musicMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
  btn.title = state.musicMuted ? "Muziek aan" : "Muziek uit";
  btn.classList.toggle("muted", state.musicMuted);
}

// ─── Voortgang tab ───────────────────────────────────────────
function renderVoortgang() {
  const el = document.getElementById("tab-voortgang");
  if (!el) return;

  const profile = getActiveProfile();
  if (!profile) {
    el.innerHTML = '<h2>📊 Voortgang</h2><p class="hint">Selecteer eerst een profiel.</p>';
    return;
  }

  let html = `<h2>📊 Voortgang van ${escHtml(profile.naam)}</h2>`;

  for (const stage of STAGES) {
    const unlocked = isStageUnlocked(profile, stage.id);
    const sp       = profile.stageProgress[stage.id];

    html += `<div class="voortgang-stage${unlocked ? "" : " locked"}">`;
    html += `<h3>${stage.emoji} ${escHtml(stage.label)}</h3>`;

    if (!unlocked) {
      html += `<p class="hint">🔒 Voltooi de vorige stage om dit vrij te spelen.</p></div>`;
      continue;
    }

    html += `<div class="voortgang-levels">`;
    const keys = [...stage.tables.map((t) => `table-${t}`), "combo", "bonus"];
    for (const key of keys) {
      const lp  = sp.levels[key];
      const lbl = getLevelLabel(stage.id, key);
      const lvlUnlocked = isLevelUnlocked(profile, stage.id, key);
      const icon = lp.mastered ? "⭐" : lvlUnlocked ? "🎯" : "🔒";
      html += `<div class="voortgang-level${lp.mastered ? " mastered" : ""}${!lvlUnlocked ? " locked" : ""}">`;
      html += `<div class="vl-head"><span>${icon} ${escHtml(lbl)}</span>`;
      if (lp.mastered && lp.bestTimeMs != null) html += `<span class="vl-time">${(lp.bestTimeMs / 1000).toFixed(1)}s</span>`;
      html += `</div>`;
      if (lp.badges.length > 0) {
        html += `<div class="vl-badges">`;
        lp.badges.forEach((b) => { html += `<span class="badge-pill">${badgeEmoji(b)} ${escHtml(b)}</span>`; });
        html += `</div>`;
      }
      if (lp.runs.length > 0) {
        html += `<p class="vl-runs">Runs: ${lp.runs.length} · Perfect: ${lp.perfectCount}</p>`;
      }
      html += `</div>`;
    }
    html += `</div>`;

    if (sp.stageBadges.length > 0) {
      html += `<div class="stage-badges-row">`;
      sp.stageBadges.forEach((b) => {
        const e = b === "StageCompleted" ? "✅" : "🌟";
        html += `<span class="badge-pill">${e} ${escHtml(b)}</span>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  }

  el.innerHTML = html;
}

// ─── Profielen tab ───────────────────────────────────────────
function renderProfielen() {
  const el = document.getElementById("tab-profielen");
  if (!el) return;

  let html = `<h2>👤 Profielen</h2><div class="profile-list">`;
  for (const p of state.profiles) {
    const isActive = p.id === state.activeProfileId;
    html += `<div class="profile-item${isActive ? " active-profile" : ""}">`;
    html += `<span class="profile-name">${isActive ? "★ " : ""}${escHtml(p.naam)}</span>`;
    html += `<span class="profile-coins">💰 ${p.coins}</span>`;
    html += `<div class="profile-actions">`;
    if (!isActive)
      html += `<button class="btn btn-small" data-action="switch" data-id="${escHtml(p.id)}">Activeer</button>`;
    if (state.profiles.length > 1)
      html += `<button class="btn btn-small btn-danger" data-action="delete" data-id="${escHtml(p.id)}">Verwijder</button>`;
    html += `</div></div>`;
  }
  html += `</div>`;
  html += `<div class="new-profile-form"><h3>Nieuw profiel</h3>
    <div class="form-row">
      <input id="newProfileName" type="text" class="text-input" placeholder="Bijv. Sam" maxlength="20" />
      <button id="createProfileBtn" class="btn btn-primary">➕ Maak aan</button>
    </div>
  </div>`;

  el.innerHTML = html;

  el.querySelectorAll("[data-action='switch']").forEach((btn) => {
    btn.addEventListener("click", () => switchProfile(btn.dataset.id));
  });
  el.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", () => deleteProfile(btn.dataset.id));
  });
  document.getElementById("createProfileBtn")?.addEventListener("click", () => {
    const name = document.getElementById("newProfileName")?.value.trim();
    if (name) { createProfile(name); document.getElementById("newProfileName").value = ""; }
  });
  document.getElementById("newProfileName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const name = e.target.value.trim();
      if (name) { createProfile(name); e.target.value = ""; }
    }
  });
}

// ─── Profile management ──────────────────────────────────────
async function createProfile(naam) {
  const cleaned = naam.trim();
  if (!cleaned) return;
  if (state.profiles.some((p) => p.naam.toLowerCase() === cleaned.toLowerCase())) {
    alert("Die naam bestaat al. Kies een andere naam."); return;
  }
  const pin = generatePin();
  const profile = defaultProfile(cleaned, pin);
  state.profiles.push(profile);
  state.activeProfileId = profile.id;
  saveState();
  await saveProfileToSupabase(profile);
  renderAll();
  alert(
  `Welkom ${cleaned}!\n\nJe geheime code is:\n\n${pin}\n\nOnthoud deze code!`);

}

function switchProfile(id) {
  if (!state.profiles.some((p) => p.id === id)) return;
  const player = document.getElementById("musicPlayer");
  if (player) player.pause();
  state.activeProfileId = id;
  saveState();
  renderAll();
}

async function deleteProfile(id) {
  if (!confirm("Weet je zeker dat je dit profiel wilt verwijderen? De scores van dit profiel worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.")) return;
  const profileToDelete =
  state.profiles.find((p) => p.id === id);
  if (profileToDelete) {
    await deleteProfileFromSupabase(
      profileToDelete.naam
    );
  }  
  // Remove leaderboard runs for this profile
  state.runsAllTime = state.runsAllTime.filter((r) => r.profileId !== id);
  // Remove speed-champion records belonging to this profile
  for (const levelId of Object.keys(state.speedChampions)) {
    if (state.speedChampions[levelId]?.profileId === id) {
      delete state.speedChampions[levelId];
    }
  }
  state.profiles = state.profiles.filter((p) => p.id !== id);
  if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id || null;
  saveState();
  renderAll();
}

// ─── Shop tab ────────────────────────────────────────────────
function renderShop() {
  const el = document.getElementById("tab-shop");
  if (!el) return;

  const profile = getActiveProfile();
  if (!profile) {
    el.innerHTML = '<h2>🛒 Shop</h2><p class="hint">Selecteer eerst een profiel.</p>';
    return;
  }

  el.innerHTML = `<h2>🛒 Shop</h2>
    <div class="shop-lock-hint">Je hebt ${profile.coins} 💰 om te besteden (of je kunt nog even doorsparen).</div>
    <details class="coin-legend">
      <summary>Hoe kan ik 💰 verdienen?</summary>
      <div class="coin-legend-grid">
        <span> Één keer per level: </span><strong> </strong>
        <span>🎯 Tafel level behaald</span><strong>10 💰</strong>
        <span>🔀 Mix level behaald</span><strong>25 💰</strong>
        <span>🎁 Bonus level behaald</span><strong>60 💰</strong>
        <span>🏅 Eerste perfecte run</span><strong>10 💰</strong>
        <span>🥉 3× perfect voltooid</span><strong>10 💰</strong>
        <span>⚡ Snelste kampioen (per keer dat je hem verdient)</span><strong>10 💰</strong>
        <span>💪 Uitdagingen foutloos *</span><strong>20 💰</strong>
        <span> <em>* Een uitdagingen level komt soms beschikbaar onder de tab 💪 Uitdagingen. </em></span><strong> </strong>
      </div>
    </details>
    <h3>🖼️ Achtergronden</h3><div class="shop-grid" id="themeGrid"></div>
    <h3>🎭 Karakters</h3><div class="shop-grid" id="charGrid"></div>
    <h3>🎵 Muziek</h3><div class="shop-grid" id="musicGrid"></div>`;

  const themeGrid = document.getElementById("themeGrid");
  const charGrid  = document.getElementById("charGrid");
  const musicGrid = document.getElementById("musicGrid");

  // ── backgrounds ───────────────────────────────────────────
  // ── Uploaded backgrounds (no base themes in shop) ────────
  const uploadedThemes = getAllThemes();
  
  // "Geen achtergrond" option — always visible
  const noneThemeSelected = !uploadedThemes.some((t) => t.id === profile.selectedThemeId);
  const noneThemeCard = document.createElement("div");
  noneThemeCard.className = `shop-card${noneThemeSelected ? " current" : ""}`;
  noneThemeCard.innerHTML = `<div class="shop-card-name">🚫 Geen achtergrond</div>
    <button class="btn${noneThemeSelected ? " btn-active" : " btn-primary"}"${noneThemeSelected ? " disabled" : ""}>${noneThemeSelected ? "✅ Gekozen" : "Gebruik"}</button>`;
  if (!noneThemeSelected) {
    noneThemeCard.querySelector("button").addEventListener("click", () => {
      profile.selectedThemeId = "classic";
      saveState();
      saveProfileToSupabase(profile);
      applyTheme(profile);
      renderShop();
    });
  }
  themeGrid.append(noneThemeCard);
  if (uploadedThemes.length === 0) {
    themeGrid.insertAdjacentHTML("beforeend", '<p class="hint" style="width:100%">Nog geen achtergronden beschikbaar. Vraag een admin om iets toe te voegen!</p>');
  } else {
    for (const theme of uploadedThemes) {
      const owned        = theme.prijs === 0 || profile.unlockedThemeIds.includes(theme.id) || state.admin.devUnlockShop;
      const current      = profile.selectedThemeId === theme.id;
      const canAfford    = profile.coins >= theme.prijs;
      const tooExpensive = !owned && !state.admin.devUnlockShop && !canAfford;

      const card = document.createElement("div");
      card.className = ["shop-card", current ? "current" : "", tooExpensive ? "shop-locked" : ""].filter(Boolean).join(" ");

      const label = current ? "✅ Gekozen"
        : owned || state.admin.devUnlockShop ? "Gebruik"
        : canAfford ? `💰 ${theme.prijs}`
        : `${theme.prijs} 💰`;

      card.innerHTML = `<div class="shop-card-name">${escHtml(theme.naam)}</div>
        <button class="btn${current ? " btn-active" : !tooExpensive ? " btn-primary" : " btn-locked"}"${current || tooExpensive ? " disabled" : ""}>${label}</button>`;

      if (!current && !tooExpensive) {
        card.querySelector("button").addEventListener("click", () => {
          if (!owned && !state.admin.devUnlockShop) {
            if (profile.coins < theme.prijs) return;
            profile.coins -= theme.prijs;
            profile.unlockedThemeIds.push(theme.id);
          }
          profile.selectedThemeId = theme.id;
          saveState();
          saveProfileToSupabase(profile);
          applyTheme(profile);
          updateCoinBadge();
          renderShop();
        });
      }
      themeGrid.append(card);
    }
  }

  // ── Characters ───────────────────────────────────────────
  const chars = getAllCharacters();
  if (chars.length === 0) {
    charGrid.innerHTML = '<p class="hint">Nog geen karakters beschikbaar. Vraag een admin om iets toe te voegen!</p>';
  } else {
    // Add "geen karakter" option
    const noneCard = document.createElement("div");
    const noneSelected = !profile.selectedCharacterId;
    noneCard.className = `shop-card${noneSelected ? " current" : ""}`;
    noneCard.innerHTML = `<div class="shop-card-name">🚫 Geen karakter</div>
      <button class="btn${noneSelected ? " btn-active" : " btn-primary"}"${noneSelected ? " disabled" : ""}>${noneSelected ? "✅ Gekozen" : "Gebruik"}</button>`;
    if (!noneSelected) {
      noneCard.querySelector("button").addEventListener("click", () => {
        profile.selectedCharacterId = null;
        saveState();
        saveProfileToSupabase(profile);
        applyCharacter(profile);
        renderShop();
      });
    }
    charGrid.append(noneCard);

    for (const char of chars) {
      const owned        = char.prijs === 0 || (profile.unlockedCharacterIds || []).includes(char.id) || state.admin.devUnlockShop;
      const current      = profile.selectedCharacterId === char.id;
      const canAfford    = profile.coins >= char.prijs;
      const tooExpensive = !owned && !state.admin.devUnlockShop && !canAfford;

      const card = document.createElement("div");
      card.className = ["shop-card", current ? "current" : "", tooExpensive ? "shop-locked" : ""].filter(Boolean).join(" ");

      const label = current ? "✅ Gekozen"
        : owned || state.admin.devUnlockShop ? "Gebruik"
        : canAfford ? `💰 ${char.prijs}`
        : `${char.prijs} 💰`;

      card.innerHTML = `<div class="shop-card-name">${escHtml(char.naam)}</div>
        <button class="btn${current ? " btn-active" : !tooExpensive ? " btn-primary" : " btn-locked"}"${current || tooExpensive ? " disabled" : ""}>${label}</button>`;

      if (!current && !tooExpensive) {
        card.querySelector("button").addEventListener("click", () => {
          if (!owned && !state.admin.devUnlockShop) {
            if (profile.coins < char.prijs) return;
            profile.coins -= char.prijs;
            if (!Array.isArray(profile.unlockedCharacterIds)) profile.unlockedCharacterIds = [];
            profile.unlockedCharacterIds.push(char.id);
          }
          profile.selectedCharacterId = char.id;
          saveState();
          saveProfileToSupabase(profile);
          applyCharacter(profile);
          updateCoinBadge();
          renderShop();
        });
      }
      charGrid.append(card);
    }
  }

  // ── Music ────────────────────────────────────────────────
  for (const track of getAllTracks()) {
    const owned        = track.prijs === 0 || profile.unlockedTrackIds.includes(track.id) || state.admin.devUnlockShop;
    const current      = profile.selectedTrackId === track.id;
    const cost         = track.prijs || 0;
    const canAfford    = profile.coins >= cost;
    const tooExpensive = !owned && !state.admin.devUnlockShop && !canAfford;

    const card = document.createElement("div");
    card.className = `shop-card${current ? " current" : ""}${tooExpensive ? " shop-locked" : ""}`;

    const label = current ? "✅ Actief"
      : owned || state.admin.devUnlockShop ? "Gebruik"
      : canAfford ? `💰 ${cost}`
      : `${cost} 💰`;

    card.innerHTML = `<div class="shop-card-name">🚫 ${escHtml(track.naam)}</div>
      <button class="btn${current ? " btn-active" : !tooExpensive ? " btn-primary" : " btn-locked"}"${current || tooExpensive ? " disabled" : ""}>${label}</button>`;

    if (!current && !tooExpensive) {
      card.querySelector("button").addEventListener("click", () => {
        if (!owned && !state.admin.devUnlockShop) {
          if (profile.coins < cost) return;
          profile.coins -= cost;
          profile.unlockedTrackIds.push(track.id);
        }
        profile.selectedTrackId = track.id;
        saveState();
        saveProfileToSupabase(profile);
        applyTrack(profile);
        updateCoinBadge();
        renderShop();
      });
    }
    musicGrid?.append(card);
  }
}

// ─── Leaderboard tab ─────────────────────────────────────────
/** Returns true when the active profile has unlocked (can see) this level */
function isLevelKnownToProfile(profile, stageId, levelKey) {
  if (!profile) return false;
  return isLevelUnlocked(profile, stageId, levelKey);
}

function renderLeaderboard() {
  const el = document.getElementById("tab-leaderboard");
  if (!el) return;

  const profile = getActiveProfile();
  const mode    = profile?.gameMode || "keersommen";
  const stages  = getStagesForMode(mode);

  const filterOptions = stages.flatMap((s) => {
    const levelKeys = getStageLevelKeys(s);
    return [
      ...levelKeys.map((key) => {
        const known = isLevelKnownToProfile(profile, s.id, key);
        const lbl   = known ? `${getLevelLabel(s.id, key)} — ${s.label}` : `🔒 ??? — ${s.label}`;
        return `<option value="${getLevelId(s.id, key)}">${lbl}</option>`;
      }),
      (() => {
        const known = isLevelKnownToProfile(profile, s.id, "combo");
        const lbl   = known ? `Mix — ${s.label}` : `🔒 ??? — ${s.label}`;
        return `<option value="${getLevelId(s.id, "combo")}">${lbl}</option>`;
      })(),
      (() => {
        const known = isLevelKnownToProfile(profile, s.id, "bonus");
        const lbl   = known ? `Bonus — ${s.label}` : `🔒 ??? — ${s.label}`;
        return `<option value="${getLevelId(s.id, "bonus")}">${lbl}</option>`;
      })(),
    ];
  }).join("");

  el.innerHTML = `<h2>🏆 Leaderboards</h2>
    <div class="filter-row">
      <label for="lbFilter">Level:</label>
      <select id="lbFilter" class="select-input">
        <option value="all">Alle levels</option>
        ${filterOptions}
      </select>
    </div>
    <div id="lbContent"></div>`;

  renderLeaderboardContent("all");
  document.getElementById("lbFilter")?.addEventListener("change", (e) => renderLeaderboardContent(e.target.value));
}

function renderLeaderboardContent(filter) {
  const container = document.getElementById("lbContent");
  if (!container) return;

  const mode    = getActiveProfile()?.gameMode || "keersommen";
  const isPm    = (run) => run.stageId.startsWith("pm-");
  const modeRuns = state.runsAllTime.filter(mode === "plusmin" ? isPm : (run) => !isPm(run));
  let runs = filter === "all"
    ? modeRuns
    : modeRuns.filter((r) => r.levelId === filter);

  runs = runs.slice().sort((a, b) => a.timeMs - b.timeMs).slice(0, 20);

  if (runs.length === 0) {
    container.innerHTML = '<p class="hint">Nog geen scores. Speel een Challenge-ronde om op het bord te komen!</p>';
    return;
  }

  const profile = getActiveProfile();

  const rows = runs.map((run, i) => {
    const medal   = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const date    = new Date(run.playedAt).toLocaleDateString("nl-NL");
    const mistEl  = run.mistakes === 0 ? "✅" : `${run.mistakes}✗`;
    const known   = isLevelKnownToProfile(profile, run.stageId, run.levelKey);
    const lvlHtml = known
      ? escHtml(getLevelLabel(run.stageId, run.levelKey))
      : `<span class="lb-hidden" title="Speel dit level om de naam te zien!">???</span>`;
    return `<div class="lb-row${i < 3 ? " top3" : ""}">
      <span class="lb-rank">${medal}</span>
      <span class="lb-name">${escHtml(run.profileName)}</span>
      <span class="lb-level">${lvlHtml}</span>
      <span class="lb-time">${(run.timeMs / 1000).toFixed(1)}s</span>
      <span class="lb-mistakes">${mistEl}</span>
      <span class="lb-date">${date}</span>
    </div>`;
  });

  container.innerHTML = `<div class="leaderboard-list">${rows.join("")}</div>`;
}

// ─── Uitdagingen tab ─────────────────────────────────────────
function renderUitdagingen() {
  const el = document.getElementById("tab-uitdagingen");
  if (!el) return;

  const profile = getActiveProfile();
  if (!profile) {
    el.innerHTML = '<h2>💪 Uitdagingen</h2><p class="hint">Selecteer eerst een profiel.</p>';
    return;
  }

  const mistakes = profile.recentMistakes || [];
  const timeLim  = getTimeLimitSeconds("uitdagingen");
  let html = `<h2>💪 Uitdagingen van ${escHtml(profile.naam)}</h2>`;

  if (mistakes.length === 0) {
    html += `<p class="hint">🎉 Nog geen uitdagingen! Ga zo door.</p>`;
  } else {
    html += `</div>`;
    if (mistakes.length >= 10) {
      html += `<div class="uitdagingen-challenge-wrap">
        <p class="hint">🏆 Je hebt ${mistakes.length} uitdagingen — oefen er 10 foutloos binnen ${timeLim}s en verdien <strong>20 💰</strong>!</p>
        <button id="startUitdagingenBtn" class="btn btn-primary btn-large">💪 Oefen deze sommen</button>
      </div>`;
      html += `<p> </p>`;
    }
    html += `<p class="hint">De ${mistakes.length} meest recente sommen die extra aandacht nodig hebben:</p>
    <div class="mistakes-list">`;
    for (const m of mistakes) {
      const ago = formatTimeAgo(m.ts);
      html += `<div class="mistake-item">
        <span class="mistake-q">${escHtml(m.question)} = ?</span>
        <span class="mistake-given">Jij zei: <strong>${m.given}</strong></span>
        <span class="mistake-correct">Goed: <strong>${m.answer}</strong></span>
        <span class="mistake-when">${ago}</span>
      </div>`;
    }
    
  }
  el.innerHTML = html;

  document.getElementById("startUitdagingenBtn")?.addEventListener("click", startMistakesChallenge);
}

function generateMistakeQuestions(mistakes) {
  const selected = mistakes.slice(0, 10); // always use the 10 most recent
  const doubled = [...selected, ...selected];
  for (let i = doubled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
  }
  return doubled.map((m) => ({
    id: uid(),
    text: m.question,
    answer: m.answer,
    status: "pending",
    userAnswer: null,
  }));
}

function startMistakesChallenge() {
  const profile = getActiveProfile();
  if (!profile || profile.recentMistakes.length < 10) return;

  const usedMistakes = profile.recentMistakes.slice(0, 10);
  game = {
    active:               true,
    paused:               false,
    wasEverPaused:        false,
    mode:                 "challenge",
    stageId:              null,
    levelKey:             "uitdagingen",
    levelType:            "uitdagingen",
    levelId:              "uitdagingen",
    questions:            generateMistakeQuestions(profile.recentMistakes),
    originalQuestionCount: 20,
    currentIndex:         0,
    mistakes:             0,
    startedAtMs:          Date.now(),
    pausedAccumulatedMs:  0,
    pauseStartedMs:       0,
    timerIntervalId:      null,
    isMistakesChallenge:  true,
    usedMistakes,
  };

  const titleEl = document.getElementById("levelTitle");
  if (titleEl) titleEl.textContent = "💪 Uitdagingen";

  const modePill = document.getElementById("modePill");
  if (modePill) { modePill.textContent = "🏆 Challenge"; modePill.className = "pill-mode challenge"; }

  document.getElementById("pauseBanner")?.classList.add("hidden");
  document.getElementById("feedbackText").textContent = "";

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) pauseBtn.textContent = "⏸️ Pauze";

  const inp = document.getElementById("answerInput");
  if (inp) { inp.value = ""; inp.disabled = false; }

  showView("game");
  renderWorksheet();
  showCurrentQuestion();
  startTimer();
}

function formatTimeAgo(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60)    return `${diffSec}s geleden`;
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)} min geleden`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} uur geleden`;
  return new Date(ts).toLocaleDateString("nl-NL");
}

// ─── Admin tab ───────────────────────────────────────────────
let _adminMode = "keersommen";

function renderAdmin() {
  const el = document.getElementById("tab-admin");
  if (!el) return;

  if (!state.admin.unlocked) {
    el.innerHTML = `<h2>⚙️ Admin</h2>
      <div class="admin-lock">
        <p class="hint">Voer het beheerderswachtwoord in. (eerste keer inloggen --> Vraag Solange!).</p>
        <div class="form-row">
          <input id="adminPwInput" type="password" class="text-input" placeholder="Wachtwoord" autocomplete="current-password" />
          <button id="adminUnlockBtn" class="btn btn-primary">🔓 Open</button>
        </div>
      </div>`;
    document.getElementById("adminPwInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("adminUnlockBtn")?.click();
    });
    document.getElementById("adminUnlockBtn")?.addEventListener("click", () => {
      if (document.getElementById("adminPwInput")?.value === state.admin.password) {
        state.admin.unlocked = true;
        renderAdmin();
      } else {
        alert("Onjuist wachtwoord.");
      }
    });
    return;
  }

  // ── Uploaded themes list ─────────────────────────────────
  const uploadedThemeRows = getAllThemes().length > 0
    ? getAllThemes().map((t) =>
        `<div class="uploaded-item">
          <span class="uploaded-name">${escHtml(t.naam)}</span>
          <span class="uploaded-price">💰 ${t.prijs}</span>
          <button class="btn btn-small btn-danger" data-delete-theme="${escHtml(t.id)}">🗑️ Verwijder</button>
        </div>`
      ).join("")
    : `<p class="hint">Nog geen achtergronden geüpload.</p>`;

  // ── Uploaded characters list ─────────────────────────────
  const uploadedCharRows = getAllCharacters().length > 0
    //? state.admin.uploadedCharacters.map((c) =>
      ? getAllCharacters().map((c) =>
        `<div class="uploaded-item">
          <span class="uploaded-name">${escHtml(c.naam)}</span>
          <span class="uploaded-price">💰 ${c.prijs}</span>
          <button class="btn btn-small btn-danger" data-delete-char="${escHtml(c.id)}">🗑️ Verwijder</button>
        </div>`
      ).join("")
    : `<p class="hint">Nog geen karakters geüpload.</p>`;

  // ── Uploaded tracks list ─────────────────────────────────
  const uploadedTrackRows = state.admin.uploadedTracks.length > 0
    ? state.admin.uploadedTracks.map((t) =>
        `<div class="uploaded-item">
          <span class="uploaded-name">${escHtml(t.naam)}</span>
          <span class="uploaded-price">💰 ${t.prijs}</span>
          <button class="btn btn-small btn-danger" data-delete-track="${escHtml(t.id)}">🗑️ Verwijder</button>
        </div>`
      ).join("")
    : `<p class="hint">Nog geen muziek geüpload.</p>`;

  // ── Time limits config rows ──────────────────────────────
  const adminModeTabs = `
    <div class="admin-mode-tabs">
      <button class="admin-mode-tab${_adminMode === "keersommen" ? " active" : ""}" data-admin-mode="keersommen">✖️ Keersommen</button>
      <button class="admin-mode-tab${_adminMode === "plusmin" ? " active" : ""}" data-admin-mode="plusmin">➕➖ Plus-Min</button>
    </div>`;

  const timeLevelKeys = [];
  if (_adminMode === "keersommen") {
    const seenTableKeys = new Set();
    for (const stage of STAGES) {
      for (const t of stage.tables) {
        const k = `table-${t}`;
        if (!seenTableKeys.has(k)) { seenTableKeys.add(k); timeLevelKeys.push({ key: k, label: `Tafel ${t}` }); }
      }
    }
    timeLevelKeys.push({ key: "combo",       label: "Mix (Combo)" });
    timeLevelKeys.push({ key: "bonus",       label: "Bonus (40 vragen)" });
    timeLevelKeys.push({ key: "uitdagingen", label: "💪 Uitdagingen level" });
  } else {
    for (const [key, label] of Object.entries(PM_LEVEL_LABELS)) {
      timeLevelKeys.push({ key, label });
    }
    timeLevelKeys.push({ key: "combo",       label: "Mix (Combo)" });
    timeLevelKeys.push({ key: "bonus",       label: "Bonus (40 vragen)" });
    timeLevelKeys.push({ key: "uitdagingen", label: "💪 Uitdagingen level" });
  }

  const timeConfigRows = timeLevelKeys.map(({ key, label }) => {
    const cur = getTimeLimitSeconds(key);
    return `<tr>
      <td>${escHtml(label)}</td>
      <td class="time-current">${cur}s</td>
      <td><input type="number" min="5" max="600" step="5" class="time-limit-input text-input" data-levelkey="${escHtml(key)}" value="${cur}" /></td>
    </tr>`;
  }).join("");

  // ── Profile list for deletion ────────────────────────────
  const adminProfileRows = state.profiles.length > 0
    ? state.profiles.map((p) => {
        const isActive  = p.id === state.activeProfileId;
        const modeLabel = p.gameMode === "plusmin" ? "➕➖ Plus-Min" : "✖️ Keersommen";
        return `<div class="admin-profile-item${isActive ? " active-profile" : ""}">
          <span class="profile-name">${isActive ? "★ " : ""}${escHtml(p.naam)}</span>
          <span class="profile-pin">🔑 PIN: ${escHtml(p.pin || "onbekend")}</span>
          <span class="profile-coins">💰 ${p.coins}</span>
          <button class="btn btn-small btn-mode" data-toggle-mode="${escHtml(p.id)}">${modeLabel}</button>
          <button class="btn btn-small btn-danger" data-delete-profile="${escHtml(p.id)}">🗑️ Verwijder</button>
        </div>`;
      }).join("")
    : `<p class="hint">Geen profielen aangemaakt.</p>`;

  // ── Player statistics (cross-table: levels × players) ──
  const statsHTML = (() => {
    if (state.profiles.length === 0) return `<p class="hint">Geen profielen.</p>`;
    const profiles = state.profiles;
    const headerCells = profiles.map((p) =>
      `<th class="stat-center">${escHtml(p.naam)}<br><small class="stat-coins">💰 ${p.coins}</small></th>`
    ).join("");
    let rows = "";
    if (_adminMode === "keersommen") {
      for (const stage of STAGES) {
        rows += `<tr class="stats-stage-header"><td colspan="${profiles.length + 1}">${stage.emoji} ${escHtml(stage.label)}</td></tr>`;
        for (const key of [...stage.tables.map((t) => `table-${t}`), "combo", "bonus"]) {
          const lbl = key === "combo"
            ? `Mix ${stage.comboTables.join(", ")}`
            : key === "bonus" ? "Bonus"
            : `Tafel ${key.replace("table-", "")}`;
          const cells = profiles.map((p) => {
            const lp = p.stageProgress[stage.id]?.levels[key];
            if (!lp) return `<td class="stat-center">—</td>`;
            let val;
            if (lp.perfectCount > 0)     val = `<span class="stat-ok">⭐ ${lp.perfectCount}×</span>`;
            else if (lp.runs.length > 0) val = `${lp.runs.length}`;
            else                         val = `—`;
            return `<td class="stat-center">${val}</td>`;
          }).join("");
          rows += `<tr><td class="stat-level-name">${escHtml(lbl)}</td>${cells}</tr>`;
        }
      }
    } else {
      for (const stage of PM_STAGES) {
        rows += `<tr class="stats-stage-header"><td colspan="${profiles.length + 1}">${stage.emoji} ${escHtml(stage.label)}</td></tr>`;
        for (const key of [...stage.levels, "combo", "bonus"]) {
          const lbl = key === "combo" ? "Mix ➕➖"
            : key === "bonus" ? "Bonus"
            : (PM_LEVEL_LABELS[key] || key);
          const cells = profiles.map((p) => {
            const lp = p.stageProgress[stage.id]?.levels[key];
            if (!lp) return `<td class="stat-center">—</td>`;
            let val;
            if (lp.perfectCount > 0)     val = `<span class="stat-ok">⭐ ${lp.perfectCount}×</span>`;
            else if (lp.runs.length > 0) val = `${lp.runs.length}`;
            else                         val = `—`;
            return `<td class="stat-center">${val}</td>`;
          }).join("");
          rows += `<tr><td class="stat-level-name">${escHtml(lbl)}</td>${cells}</tr>`;
        }
      }
    }
    return `<div class="stats-cross-scroll"><table class="admin-stats-table">
      <thead><tr><th>Level</th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  })();

  el.innerHTML = `<h2>⚙️ Admin</h2>
    <div class="admin-panel">
      <div class="admin-section">
        <h3>🔑 Wachtwoord wijzigen</h3>
        <div class="form-row">
          <input id="newPwInput" type="password" class="text-input" placeholder="Nieuw wachtwoord (min. 3 tekens)" autocomplete="new-password" />
          <button id="setPwBtn" class="btn">Opslaan</button>
        </div>
      </div>
      <div class="admin-section">
        <h3>🖼️ Achtergronden beheren</h3>
        <div class="uploaded-list">${uploadedThemeRows}</div>
        <h4 class="upload-sub-header">Nieuwe achtergrond toevoegen</h4>
        <div class="form-row">
          <input id="themeFileInput" type="file" accept="image/*" />
          <input id="themeNameInput" type="text" class="text-input" placeholder="Naam" />
          <input id="themePriceInput" type="number" min="0" step="1" class="text-input price-input" placeholder="Prijs (coins)" value="0" />
          <button id="addThemeBtn" class="btn btn-primary">Toevoegen</button>
        </div>
        <div id="themeUploadFeedback" class="upload-feedback hidden"></div>
      </div>
      <div class="admin-section">
        <h3>🎭 Karakters beheren</h3>
        <div class="uploaded-list">${uploadedCharRows}</div>
        <h4 class="upload-sub-header">Nieuw karakter toevoegen</h4>
        <div class="form-row">
          <input id="charFileInput" type="file" accept="image/*" />
          <input id="charNameInput" type="text" class="text-input" placeholder="Naam" />
          <input id="charPriceInput" type="number" min="0" step="1" class="text-input price-input" placeholder="Prijs (coins)" value="0" />
          <button id="addCharBtn" class="btn btn-primary">Toevoegen</button>
        </div>
        <div id="charUploadFeedback" class="upload-feedback hidden"></div>
      </div>
      <div class="admin-section">
        <h3>🎵 Muziek beheren</h3>
        <div class="uploaded-list">${uploadedTrackRows}</div>
        <h4 class="upload-sub-header">Nieuwe muziek toevoegen</h4>
        <div class="form-row">
          <input id="musicFileInput" type="file" accept="audio/*" />
          <input id="musicNameInput" type="text" class="text-input" placeholder="Naam" />
          <input id="musicPriceInput" type="number" min="0" step="1" class="text-input price-input" placeholder="Prijs (coins)" value="0" />
          <button id="addMusicBtn" class="btn btn-primary">Toevoegen</button>
        </div>
        <div id="musicUploadFeedback" class="upload-feedback hidden"></div>
      </div>
      <div class="admin-section">
        <h3>👥 Profielbeheer</h3>
        <div id="adminProfileList">${adminProfileRows}</div>
        
        <div class="form-row">
          <button id="migrateProfilesBtn"
                  class="btn btn-primary">
            📤 Migreer bestaande spelers
          </button>
        </div>


      </div>
      <div class="admin-section">
        <h3>📊 Speler statistieken</h3>
        ${adminModeTabs}
        <div class="admin-stats">${statsHTML}</div>
      </div>
      <div class="admin-section">
        <h3>⏱️ Tijdslimieten instellen</h3>
        ${adminModeTabs}
        <table class="admin-time-table">
          <thead><tr><th>Level</th><th>Huidig</th><th>Nieuw (sec)</th></tr></thead>
          <tbody>${timeConfigRows}</tbody>
        </table>
        <div class="form-row" style="margin-top:10px">
          <button id="saveTimeLimitsBtn" class="btn btn-primary">⏱️ Opslaan</button>
        </div>
        <div id="timeLimitsFeedback" class="upload-feedback hidden"></div>
      </div>
      <div class="admin-section">
        <h3>🏆 Leaderboard resetten</h3>
        <p class="hint">Verwijdert alle scores. Kan niet ongedaan worden gemaakt.</p>
        <div class="form-row">
          <button id="resetLeaderboardBtn" class="btn btn-danger">🗑️ Leaderboard leegmaken</button>
        </div>
        <div id="leaderboardResetFeedback" class="upload-feedback hidden"></div>
      </div>
      <div class="admin-section">
        <h3>🧪 Om de winkel te testen</h3>
        <label class="toggle-label">
          <input id="devUnlockToggle" type="checkbox" ${state.admin.devUnlockShop ? "checked" : ""} />
          Maak alles gratis om te testen
        </label>
      </div>
      <div class="admin-section">
        <button id="adminLockBtn" class="btn">🔒 Admin sluiten</button>
      </div>
    </div>`;

  // ── Event listeners ──────────────────────────────────────
  document.getElementById("setPwBtn")?.addEventListener("click", () => {
    const pw = document.getElementById("newPwInput")?.value.trim();
    if (!pw || pw.length < 3) { alert("Kies minimaal 3 tekens."); return; }
    state.admin.password = pw;
    saveState();
    saveProfileToSupabase(profile);
    alert("Wachtwoord opgeslagen.");
    document.getElementById("newPwInput").value = "";
  });

  document.getElementById("devUnlockToggle")?.addEventListener("change", (e) => {
    state.admin.devUnlockShop = e.target.checked;
    saveState();
    saveProfileToSupabase(profile);
    renderShop();
  });

  document.getElementById("saveTimeLimitsBtn")?.addEventListener("click", () => {
    el.querySelectorAll(".time-limit-input").forEach((inp) => {
      const key = inp.dataset.levelkey;
      const val = parseInt(inp.value, 10);
      if (key && Number.isFinite(val) && val >= 5) state.admin.customTimeLimits[key] = val;
    });
    saveState();
    saveProfileToSupabase(profile);
    const fb = document.getElementById("timeLimitsFeedback");
    if (fb) { fb.textContent = "✅ Tijdslimieten opgeslagen!"; fb.className = "upload-feedback upload-ok"; }
  });

  // Delete uploaded themes
  el.querySelectorAll("[data-delete-theme]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteTheme;
      if (!confirm("Achtergrond verwijderen? Profielen die dit gebruiken worden teruggezet naar het standaardthema.")) return;
      await idbDelete(id).catch(console.error);
      state.admin.uploadedThemes = state.admin.uploadedThemes.filter((t) => t.id !== id);
      for (const p of state.profiles) {
        if (p.selectedThemeId === id) p.selectedThemeId = "classic";
        p.unlockedThemeIds = p.unlockedThemeIds.filter((tid) => tid !== id);
      }
      saveState();
      saveProfileToSupabase(profile);
      applyTheme(getActiveProfile());
      renderShop();
      renderAdmin();
    });
  });

  // Delete uploaded characters
  el.querySelectorAll("[data-delete-char]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteChar;
      if (!confirm("Karakter verwijderen? Profielen die dit gebruiken worden teruggezet.")) return;
      await idbDelete(id).catch(console.error);
      state.admin.uploadedCharacters = state.admin.uploadedCharacters.filter((c) => c.id !== id);
      for (const p of state.profiles) {
        if (p.selectedCharacterId === id) p.selectedCharacterId = null;
        if (Array.isArray(p.unlockedCharacterIds)) p.unlockedCharacterIds = p.unlockedCharacterIds.filter((cid) => cid !== id);
      }
      saveState();
      saveProfileToSupabase(profile);
      applyCharacter(getActiveProfile());
      renderShop();
      renderAdmin();
    });
  });

  // Delete uploaded tracks
  el.querySelectorAll("[data-delete-track]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteTrack;
      if (!confirm("Muziek verwijderen? Profielen die dit gebruiken worden teruggezet naar geen muziek.")) return;
      await idbDelete(id).catch(console.error);
      state.admin.uploadedTracks = state.admin.uploadedTracks.filter((t) => t.id !== id);
      for (const p of state.profiles) {
        if (p.selectedTrackId === id) p.selectedTrackId = "silent";
        p.unlockedTrackIds = p.unlockedTrackIds.filter((tid) => tid !== id);
      }
      saveState();
      saveProfileToSupabase(profile);
      applyTrack(getActiveProfile());
      renderShop();
      renderAdmin();
    });
  });

  // Switch admin view mode (keersommen / plusmin)
  el.querySelectorAll("[data-admin-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _adminMode = btn.dataset.adminMode;
      renderAdmin();
    });
  });

  // Toggle gameMode per profile
  el.querySelectorAll("[data-toggle-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.dataset.toggleMode;
      const p   = state.profiles.find((pr) => pr.id === pid);
      if (!p) return;
      p.gameMode = p.gameMode === "plusmin" ? "keersommen" : "plusmin";
      saveState();
      saveProfileToSupabase(profile);
      if (pid === state.activeProfileId) renderAll();
      else renderAdmin();
    });
  });

  // Delete profiles (via admin)
  el.querySelectorAll("[data-delete-profile]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProfile(btn.dataset.deleteProfile));
  });

  document.getElementById("addThemeBtn")?.addEventListener("click", async () => {
    const file  = document.getElementById("themeFileInput")?.files[0];
    const name  = document.getElementById("themeNameInput")?.value.trim();
    const price = Math.max(0, parseInt(document.getElementById("themePriceInput")?.value, 10) || 0);
    const fb    = document.getElementById("themeUploadFeedback");
    if (!file || !name) {
      if (fb) { fb.textContent = "⚠️ Kies eerst een afbeelding én geef een naam op."; fb.className = "upload-feedback upload-error"; }
      return;
    }
    const id      = `up-theme-${uid()}`;
    const dataUrl = await fileToDataUrl(file);
    await idbSet(id, dataUrl);
    state.admin.uploadedThemes.push({ id, naam: name, prijs: price, cssTheme: "classic", customImage: dataUrl });
    saveState();
    saveProfileToSupabase(profile);
    renderShop();
    renderAdmin();
    const newThemeFb = document.getElementById("themeUploadFeedback");
    if (newThemeFb) {
      newThemeFb.textContent = `✅ Achtergrond "${escHtml(name)}" toegevoegd — prijs: 💰 ${price} coins!`;
      newThemeFb.className = "upload-feedback upload-ok";
    }
  });

  document.getElementById("addCharBtn")?.addEventListener("click", async () => {
    const file  = document.getElementById("charFileInput")?.files[0];
    const name  = document.getElementById("charNameInput")?.value.trim();
    const price = Math.max(0, parseInt(document.getElementById("charPriceInput")?.value, 10) || 0);
    const fb    = document.getElementById("charUploadFeedback");
    if (!file || !name) {
      if (fb) { fb.textContent = "⚠️ Kies eerst een afbeelding én geef een naam op."; fb.className = "upload-feedback upload-error"; }
      return;
    }
    const id      = `up-char-${uid()}`;
    const dataUrl = await fileToDataUrl(file);
    await idbSet(id, dataUrl);
    state.admin.uploadedCharacters.push({ id, naam: name, prijs: price, src: dataUrl });
    saveState();
    saveProfileToSupabase(profile);
    renderShop();
    renderAdmin();
    const newFb = document.getElementById("charUploadFeedback");
    if (newFb) {
      newFb.textContent = `✅ Karakter "${escHtml(name)}" toegevoegd — prijs: 💰 ${price} coins!`;
      newFb.className = "upload-feedback upload-ok";
    }
  });

  document.getElementById("addMusicBtn")?.addEventListener("click", async () => {
    const file  = document.getElementById("musicFileInput")?.files[0];
    const name  = document.getElementById("musicNameInput")?.value.trim();
    const price = Math.max(0, parseInt(document.getElementById("musicPriceInput")?.value, 10) || 0);
    const fb    = document.getElementById("musicUploadFeedback");
    if (!file || !name) {
      if (fb) { fb.textContent = "⚠️ Kies eerst een audiobestand én geef een naam op."; fb.className = "upload-feedback upload-error"; }
      return;
    }
    const id      = `up-track-${uid()}`;
    const dataUrl = await fileToDataUrl(file);
    await idbSet(id, dataUrl);
    state.admin.uploadedTracks.push({ id, naam: name, prijs: price, src: dataUrl });
    saveState();
    saveProfileToSupabase(profile);
    renderShop();
    renderAdmin();
    const newMusicFb = document.getElementById("musicUploadFeedback");
    if (newMusicFb) {
      newMusicFb.textContent = `✅ Muziek "${escHtml(name)}" toegevoegd — prijs: 💰 ${price} coins!`;
      newMusicFb.className = "upload-feedback upload-ok";
    }
  });

  document.getElementById("resetLeaderboardBtn")?.addEventListener("click", () => {
    if (!confirm("Weet je zeker dat je het leaderboard wilt leegmaken? Alle scores worden verwijderd. Dit kan niet ongedaan worden gemaakt.")) return;
    state.runsAllTime = [];
    for (const p of state.profiles) {
      for (const s of STAGES) {
        for (const lp of Object.values(p.stageProgress[s.id].levels)) {
          const idx = lp.badges.indexOf("LevelSpeedChampion");
          if (idx !== -1) lp.badges.splice(idx, 1);
        }
      }
    }
    state.speedChampions = {};
    saveState();
    saveProfileToSupabase(profile);
    renderLeaderboard();
    const fb = document.getElementById("leaderboardResetFeedback");
    if (fb) { fb.textContent = "✅ Leaderboard geleegd!"; fb.className = "upload-feedback upload-ok"; }
  });

  document.getElementById("migrateProfilesBtn")
    ?.addEventListener("click", async () => {

      if (!confirm(
        "Bestaande spelers naar Supabase migreren?"
      )) return;

      await migrateProfilesToSupabase();

    });

  document.getElementById("adminLockBtn")?.addEventListener("click", () => {
    state.admin.unlocked = false;
    renderAdmin();
  });
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Logout ─────────────────────────────────────────────────
function logoutProfile() {
  const player = document.getElementById("musicPlayer");
  if (player) player.pause();
  state.activeProfileId = null;
  saveState();
  
  renderAll();
}

// ─── Uitdagingen badge & toast ──────────────────────────────
function updateUitdagingenBadge() {
  const profile = getActiveProfile();
  const count   = profile?.recentMistakes?.length || 0;
  const btn     = document.querySelector(".tab-btn[data-tab='uitdagingen']");
  if (!btn) return;
  btn.classList.toggle("tab-notify", count >= 10);
}

function showToast(msg, duration = 7000) { // longer duration for slow readers, since younger children are a key audience.
  const toast = document.createElement("div");
  toast.className = "game-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ─── Profile overlay ─────────────────────────────────────────
function renderProfileOverlay() {
  const overlay  = document.getElementById("profilePickerOverlay");
  const content  = document.getElementById("overlayContent");
  const profile  = getActiveProfile();
  if (!overlay || !content) return;

  if (profile) { overlay.classList.add("hidden"); return; }
  overlay.classList.remove("hidden");

  let html = `<h1>🏎️ RekenRace</h1>
    <p>Tafeltjes oefenen met levels, badges 🏅 en beloningen 💰!</p>`;

  if (state.profiles.length > 0) {
    html += `<h2>Kies jouw profiel</h2>
      <div class="profile-picker-grid">`;
    state.profiles.forEach((p) => {
      html += `<button class="profile-pick-btn" data-id="${escHtml(p.id)}">${escHtml(p.naam)}</button>`;
    });
    html += `</div><h3>— of maak een nieuw profiel —</h3>`;
  } else {
    html += `<h2>Maak je eerste profiel aan!</h2>`;
  }

  html += `<div class="form-row" style="justify-content:center">
    <input id="overlayName" type="text" class="text-input text-large" placeholder="Jouw naam" maxlength="20" />
    <button id="overlayStartBtn" class="btn btn-primary btn-large">▶️ Start!</button>
  </div>`;

  html += `
  <div style="margin:20px 0;text-align:center;">
    <button id="parentSettingsBtn"
            class="btn">
      ⚙️ admin instellingen
    </button>
  </div>
`;

  content.innerHTML = html;

  content.querySelectorAll(".profile-pick-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {

      const selectedProfile =
          state.profiles.find(
              p => p.id === btn.dataset.id
          );

      const pin = prompt(
          `Voer de geheime code van ${selectedProfile.naam} in`
      );

      if (!pin) return;

      const ok =
          await validatePin(
              selectedProfile.naam,
              pin
          );

      if (!ok) {
          alert("Verkeerde code");
          return;
      }

      switchProfile(btn.dataset.id);

      overlay.classList.add("hidden");
      renderAll();
    });
  });

  document.getElementById("overlayStartBtn")?.addEventListener("click", () => {
    const name = document.getElementById("overlayName")?.value.trim();
    if (!name) { document.getElementById("overlayName")?.focus(); return; }
    createProfile(name);
    overlay.classList.add("hidden");
  });

  document.getElementById("overlayName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("overlayStartBtn")?.click();
  });

  document.getElementById("parentSettingsBtn")
  ?.addEventListener("click", () => {
    state.admin.unlocked = false;
    renderAll();
    openTab("admin");
    overlay.classList.add("hidden");
  });

  setTimeout(() => document.getElementById("overlayName")?.focus(), 80);
}

// ─── Render all ──────────────────────────────────────────────
function renderAll() {
  const profile = getActiveProfile();
  updateCoinBadge();
  updateProfileBadge();
  renderStageMap();
  renderShop();
  renderLeaderboard();
  renderUitdagingen();
  renderAdmin();
  applyTheme(profile);
  applyCharacter(profile);
  applyTrack(profile);
  updateMusicToggleBtn();
  updateUitdagingenBadge();
  renderProfileOverlay();
}

// ─── Initialise ──────────────────────────────────────────────
async function init() {
  loadState();
  await testSupabaseConnection();
  await loadConfiguredBackgrounds();
  await loadConfiguredCharacters();
  await loadBlobsFromIDB();

  const profiles = await loadProfilesFromSupabase();
  console.log(profiles);

  // Mode buttons
  document.getElementById("modeChallengeBtn")?.addEventListener("click", () => {
    selectedMode = "challenge";
    document.getElementById("modeChallengeBtn")?.classList.add("active");
    document.getElementById("modePracticeBtn")?.classList.remove("active");
    document.getElementById("modeHint").textContent = "Challenge: timer + voortgang + beloningen";
    document.getElementById("modeChallengeBtn")?.setAttribute("aria-pressed", "true");
    document.getElementById("modePracticeBtn")?.setAttribute("aria-pressed", "false");
  });
  document.getElementById("modePracticeBtn")?.addEventListener("click", () => {
    selectedMode = "practice";
    document.getElementById("modePracticeBtn")?.classList.add("active");
    document.getElementById("modeChallengeBtn")?.classList.remove("active");
    document.getElementById("modeHint").textContent = "Oefenmodus: geen timer, geen druk, gewoon oefenen 😊. Klik op een level om te starten!";
    document.getElementById("modePracticeBtn")?.setAttribute("aria-pressed", "true");
    document.getElementById("modeChallengeBtn")?.setAttribute("aria-pressed", "false");
  });

  // Answer input — Enter to submit
  document.getElementById("answerInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitAnswer(); }
  });

  // Game action buttons
  document.getElementById("pauseBtn")?.addEventListener("click", pauseOrResume);
  document.getElementById("resetBtn")?.addEventListener("click", resetGame);
  document.getElementById("quitBtn")?.addEventListener("click", quitGame);

  // Header profile button → shop tab
  document.getElementById("profileBtn")?.addEventListener("click", () => openTab("shop"));

  // Logout button
  document.getElementById("logoutBtn")?.addEventListener("click", logoutProfile);

  // Music mute toggle
  document.getElementById("musicToggleBtn")?.addEventListener("click", () => {
    state.musicMuted = !state.musicMuted;
    const player = document.getElementById("musicPlayer");
    if (player) player.muted = state.musicMuted;
    saveState();
    saveProfileToSupabase(profile);
    updateMusicToggleBtn();
  });

  // Tab navigation
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.dataset.tab));
  });

  // Initial render
  renderAll();
  showView("stageMap");
  openTab("shop");
  
  // const profile = defaultProfile("SupabaseTest");
  // saveProfileToSupabase(profile);
}

init();
