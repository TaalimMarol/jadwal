# Jadwal

A timetable viewer that runs on **GitHub Pages**. No server, no build step, no install.

- **Admin** logs in with the ITS ID and password set in `config.js`, uploads the whole timetable (Excel, CSV, or pasted rows), checks it, and publishes it.
- **Everyone else** types their ITS ID. Teachers see their own jadwal straight away, and anyone can look up a class by its name.

## Put it online (about 5 minutes)

1. Create a new repository on GitHub.
2. Upload **everything in this folder** to it (Add file → Upload files). Keep the `data` and `sample` folders.
3. Open `config.js` in GitHub (pencil icon) and change `admin.itsId` and `admin.password`. Commit.
4. Go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
5. After a minute the site is live at `https://<your-name>.github.io/<repository>/`.

## Each time the timetable changes

1. Open the site and log in as admin.
2. **Add the timetable**: choose the file, or paste rows copied from Excel. The app lists anything it could not read.
3. Use the **Browse jadwals** tab to check a few classes and teachers.
4. **Publish for everyone**, either way:
   - **One click:** enter your GitHub owner, repository and an access token, then press *Publish to GitHub*. The owner and repository are filled in automatically on `github.io` addresses.
   - **By hand:** press *Download jadwal.json*, then upload it into the `data` folder of the repository (it replaces the old file).
5. The live site updates within a minute or two.

### Making the access token (one-click publishing only)

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
Choose *Only select repositories* and pick this repository. Under Repository permissions set **Contents: Read and write**. Copy the token into the app when you publish. The app keeps it only until you close the tab.

## Columns in the upload

| Column | Meaning |
|---|---|
| Period | Period number. Columns are sorted ascending. |
| Class | Class name. This is what users type to view a class. |
| Subject | Used only to colour the cell (see `config.js`). |
| Book | Shown in the cell. |
| Mufawwaz/Department | Shown in small type under the book in class jadwals. Used as the teacher's name. |
| Number | The teacher's **ITS ID**. This links a teacher to their jadwal. |
| Date | Gregorian date. The day name comes from it. Excel dates, `12/10/2026`, `2026-10-12` and `12 Oct 2026` all work. |
| Time | Optional. Shown as a small tag in the cell when present. |

Header names are matched loosely. If there is no header row, the columns are read in the order above. CSV files should be saved as **CSV UTF-8** so Arabic text survives. See `sample/sample-jadwal.csv` for an example.

Rows are one per **date**. If an upload covers more than 7 days, a week picker appears. Set `weekStartsOn` in `config.js` to match your week.

## Settings in `config.js`

Admin login, ITS ID length, subject colours (with optional aliases), date order, showing the class name in teacher jadwals, and more. Each setting has a comment.

## Good to know

- **The admin login is not real security.** The ITS ID and password sit in `config.js`, which anyone can open in their browser. It stops casual visitors from seeing the upload screen, nothing more. The same goes for the user ITS ID: it is not checked against any list unless you set `allowOnlyKnownIds: true`.
- **The published timetable is public.** `data/jadwal.json` is a normal file in the repository. On a public repository, anyone who finds the address can read every name and ITS ID in it. If that matters, use a private repository (GitHub Pages from private repositories needs a paid plan) or host behind a login.
- A draft lives only in the admin's browser until it is published.
- The Excel reader (SheetJS) and the fonts load from a CDN, so the admin needs to be online to read `.xlsx` files. CSV and pasted rows work without it.
- Open the site through GitHub Pages or any web server. Browsers block the data file when `index.html` is opened directly from disk.
