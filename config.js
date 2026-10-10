/* ==========================================================================
   JADWAL — SETTINGS
   This is the only file you normally need to edit.
   ========================================================================== */
window.JADWAL_CONFIG = {

  /* ---- Titles shown in the app ------------------------------------------ */
  appTitle: "Jadwal",
  institution: "",                  // optional line under the title, e.g. "Al-Jamea tus-Saifiyah"

  /* ---- Admin login (CHANGE THESE BEFORE YOU PUBLISH) --------------------- */
  admin: {
    itsId: "Manahij",
    password: "Junnat@5253"
  },

  /* ---- Normal users ------------------------------------------------------ */
  itsIdLength: 8,                   // ITS IDs must have this many digits. Use 0 to switch the check off.
  allowOnlyKnownIds: false,         // true = only ITS IDs that appear in the uploaded jadwal can log in

  /* ---- Where the published timetable lives in this repository ------------ */
  dataFile: "data/jadwal.json",

  /* ---- Reading dates and weeks ------------------------------------------- */
  dateOrder: "DMY",                 // for typed dates such as 05/10/2026: "DMY" = day first, "MDY" = month first
  weekStartsOn: 1,                  // only used when the upload covers more than 7 days: 0=Sun 1=Mon ... 6=Sat
  locale: "en-GB",                  // language used for day and month names

  /* ---- Teacher jadwal ---------------------------------------------------- */
  showClassInTeacherView: false,    // true = also print the class name in small type under each book

  /* ---- Publishing to GitHub from inside the app (optional) --------------- */
  /* Leave empty on github.io sites: owner and repo are detected from the address. */
  github: {
    owner: "",
    repo: "",
    branch: ""                      // empty = the repository's default branch
  },

  /* ---- Subject colours ---------------------------------------------------
     Spelling is forgiving (capitals, accents and apostrophes are ignored).
     Add "aliases" for other spellings or Arabic script, e.g.
       { name: "Fiqh", color: "#D5F1CA", aliases: ["فقه"] }                  */
  fallbackColor: "#E7E9EE",         // used when a subject has no rule below
  subjects: [
    { name: "Adab",                     color: "#F5E0CB" },
    { name: "Al-Lisān al-ʿArabī",       color: "#F2F3F8" },
    { name: "English",                  color: "#9796A6" },
    { name: "Fiqh",                     color: "#D5F1CA" },
    { name: "Hikmat",                   color: "#B3F7B2" },
    { name: "Jameeiyaah Thaniyah",      color: "#E5CCDF" },
    { name: "Khaimat Riyadat",          color: "#C9EBFB" },
    { name: "Marhalat Saqafat Aamah",   color: "#E5CCDF" },
    { name: "Nashatat Ilmiyah",         color: "#F1E3FE" },
    { name: "Quran Kareem",             color: "#FFD5E5" },
    { name: "Sciences",                 color: "#FFF6A3" },
    { name: "Tawil",                    color: "#F5E0CB" },
    { name: "Akhbaar",                  color: "#CFF88A" },
    { name: "Takhassus",                color: "#A3CBE3" },
    { name: "Barāmij ʿIlmiyya",         color: "#F8D0B3" },
    { name: "Maqaalah Muwasah",         color: "#BCC77C" },
    { name: "Jameeiyah Ula",            color: "#F8CBAB" }
  ]
};
