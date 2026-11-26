# Frequency Atlas

Fictional pop radio stations in real US cities, Radio Garden style. Tap a station on the map to hear it live, read its weekly Top 30, and follow its plants (discovery artists).

## What's inside
| File | What it does |
|---|---|
| `index.html`, `styles.css`, `app.js` | The page, its look, the map, panels and the Spotify player |
| `engine.js` | Turns the songs into weekly spins, countdowns, plant reports and the network chart |
| `data.js` | **You edit this**: the 16 stations, hand-picked songs, throwbacks and plants |
| `library.js` | Built from your playlists in `playlists/` (don't edit by hand) |
| `auto.js` | This week's Spotify US chart, filled in automatically every Saturday (don't edit by hand) |
| `scripts/` | The two update scripts, plus `shared.mjs`, which holds the artist → genre list |
| `.github/workflows/update-chart.yml` | The weekly automatic update |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lets phones and computers install it as an app |

## Put it online with GitHub Pages (free)
1. Sign in at github.com and click **New repository**. Name it `frequency-atlas`, set it to **Public**, and click **Create repository**.
2. On the new repo page, click **uploading an existing file**. Drag in everything from this folder (including the `icons`, `scripts` and `playlists` folders), then click **Commit changes**.
3. The `.github` folder is hidden on Mac and often skipped by drag-and-drop. Add it by hand: click **Add file → Create new file**, type `.github/workflows/update-chart.yml` as the name, paste in the contents of that file, and commit.
4. **Settings → Pages**: under **Branch** pick `main` and `/ (root)`, then **Save**. The site is live at `https://YOUR-USERNAME.github.io/frequency-atlas/` a minute later.
5. **Settings → Actions → General → Workflow permissions**: choose **Read and write permissions** and **Save**. This lets the weekly update save its results.
6. **Actions** tab → **Weekly chart update** → **Run workflow**. This fills in this week's chart right away instead of waiting until Saturday.
7. To install it: on iPhone, open the link in Safari, tap Share, then **Add to Home Screen**. On Android or desktop Chrome, use **Install app** in the menu.

## How the automatic chart works
Every Saturday morning (Arizona time), GitHub runs `scripts/update-chart.mjs` for free. It reads the Spotify US weekly chart from kworb.net, drops holiday songs and anything that has been charting for 18+ months, and saves the rest to `auto.js`. Songs that are new to the chart enter the stations' rotations, and songs already there get their heat and trend refreshed. Each station then builds its own Top 30 from those songs, so the 16 stations still sound different from each other.

- The run's log lists **artists without genre tags**. They're treated as pop. If one is really rap, country, Latin, etc., add them to the matching list in `scripts/shared.mjs` so the right stations pick them up.
- If kworb ever changes its page and the script can't read it, the run keeps last week's data instead of breaking the site.

## Your playlists
`playlists/` holds the CSV exports of **My Favorites Collection** and **My Personal Playlist 2.0** (from Exportify). On every run:
- Releases from the last 12 months become extra current songs, scored from their Spotify popularity. Most play as **deep cuts** and new adds rather than countdown regulars.
- Songs from **2010 or later** that are at least 18 months old become **throwbacks**, shared out to the two stations whose sound suits each one best (each station's `home` artists get first dibs). Nothing older than 2010 plays; change `GOLD_MIN_YEAR` in `data.js` to move that line.
- To refresh, export the playlists again (exportify.net), upload the CSVs into `playlists/` with the same names, and the update runs automatically.

## Live: everyone hears the same thing
Every station runs a shared schedule. Each hour's playlist is worked out from just the station and the hour, so every device comes up with the same songs at the same times. Tuning in mid-song jumps to the same spot everyone else is hearing.
- A legal ID plays at the top of each hour. A song still playing then gets cut off, like a real station's hard top-of-hour break.
- The schedule needs each song's length. Lengths come from your playlist exports, and the weekly update looks up any missing ones (`scripts/durations.mjs` → `durations.js`). Songs without a known length get 3:30 slots; if one ends early, a quick ID fills the gap.
- **Requests** (tap any song) and **countdown shows** play just for you, then hand back to the live broadcast. The red **LIVE** button rejoins any time.
- Listeners need to be logged in to Spotify in the browser to stay in sync. Logged-out listeners only get 30-second previews.

## Stations you build, on every device
Stations built in the app are saved to `stations.json` in the repo, and every device that opens the site loads that file.
- **Connect once per device you build from:** Stations → **Sync across devices**, then enter a GitHub fine-grained token that has *Contents: Read and write* on this repo only. After that, every build, edit or delete publishes automatically, and other devices see it about a minute later.
- **Devices that only listen** don't need a token.
- **No token?** **Copy sync link** in the same panel copies your stations into another browser in one step.

## Playback
Songs play through Spotify's embedded player. Log in to Spotify in the same browser to hear full songs; when you're not logged in, Spotify plays 30-second previews. The stream follows a radio clock: power hits, currents, new adds, deep cuts, throwbacks, plants and recurrents, with station IDs between songs (toggle with the **ID** button). There are no hosts. Each station has one imaging voice and a sonic logo built from its frequency. It plays a legal ID at the top of each hour, positioners and sweepers every few songs, and "new music", "discovery" and "throwback" drops before those songs. The countdown show uses position drops ("Number 12"). Wasatch 101.9 skips every song marked explicit on Spotify. Songs that only come from the weekly chart don't carry that flag, so check the log if one slips through.

## Editing stations (`data.js`)
- Station fields: `tags` (how much the station leans into pop, dance, rnb, indie, alt, latin, country, kpop, rap; 1 = neutral), `nb` (new-music boost), `home` (signature artists for throwbacks), `clean` (skip explicit songs), `plants`.
- Plant row: `[spotifyTrackId, title, artist, tags, heat, weeksOut, trend]`. Heat around 50 means the plant is set up to break into the Top 30; around 13 means it's on light test spins.
- The Spotify track ID is the 22 characters after `open.spotify.com/track/` in a song's share link.

You can also add songs in the app itself: open a station → **Station → Add songs to this station** and paste Spotify track links (saved in that browser only).

## Chart rules
Spins come from each song's heat, the station's taste, a newness boost (NXT 97.9 leans hardest into new music, Harbor 92.5 the least) and a little week-to-week variation. The Top 30 ranks on this week's spins blended with last week's. Debuts enter no higher than #15, nothing climbs more than 10 spots in a week, and songs 20+ weeks old go recurrent once they fall below #20.

Station names and call letters are fictional and not affiliated with any real station.
