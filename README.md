# 🎮 Habit Quest

A gamified habit tracker built for **ADHD brains** — installed on your phone and PCs, synced through **Google Sheets**, and readable by **Google Gemini** so your AI can keep you motivated.

![icon](icons/icon-192.png)

---

## ✨ What it does

- **Daily habit checklist** with one‑tap completion and instant confetti feedback.
- **XP + levels** with fun titles (Rookie → Habit Hero → Unstoppable → Transcendent).
- **Streaks** 🔥 with milestone badges, plus a **streak freeze** ❄️ so a single missed day doesn't wreck your momentum.
- **Coins + a rewards shop** 🪙 — define your own real-world treats and cash in coins.
- **Badges/achievements** 🏅 and a GitHub‑style **consistency heatmap** 📅.
- **Cross‑device sync** — everything lives in a Google Sheet, so your phone and every PC stay in sync for free.
- **Gemini‑friendly** — because the data is in Sheets, you can ask Gemini questions about your progress with zero extra code.

> Design principle for ADHD: *immediate reward, visible progress, forgiveness over perfection.*

---

## 📁 Folder contents

```
habit-quest/
├── index.html          # the app UI
├── app.js              # game logic + backend calls + confetti
├── styles.css          # the look & feel
├── manifest.json       # PWA install metadata
├── sw.js               # service worker (offline app shell)
├── icons/
│   ├── icon-192.png    # app icons
│   ├── icon-512.png
│   └── gen_icons.py    # regenerate icons (optional)
├── backend/
│   └── Code.gs         # Google Apps Script backend (the "server")
└── README.md           # you are here
```

You only ever edit **one** thing to get it going: paste `backend/Code.gs` into Google Apps Script.

---

## 🚀 Setup (about 10 minutes, one time)

### Part 1 — Create the Google Sheet backend

1. Go to <https://sheets.new> to create a new Google Sheet. Name it **Habit Quest**.
2. In the sheet: **Extensions → Apps Script**. A script editor opens.
3. Delete the default `function myFunction() {}` code.
4. Open `backend/Code.gs` from this folder, **copy all of it**, and paste it into the editor.
5. Near the top, change this line to a long random secret (anything you like):
   ```js
   const API_TOKEN = 'change-me-to-a-long-random-token';
   ```
   You'll paste this same token into the app later. Keep it secret.
6. Click the **Save** 💾 icon.

> The first time the app runs it will **auto‑create** all the tabs (Habits, Log, Rewards, Redemptions, Achievements, User) and add a few starter habits + rewards. You don't need to make any tabs by hand.

### Part 2 — Deploy it as a Web App

1. In the Apps Script editor click **Deploy → New deployment**.
2. Click the gear ⚙️ → choose **Web app**.
3. Set:
   - **Description:** `Habit Quest API`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
     *(“Anyone” is required so the browser can call it without a Google login prompt. The API token protects your data.)*
4. Click **Deploy**, then **Authorize access** and allow the permissions.
5. Copy the **Web app URL** — it ends in `/exec`, e.g.
   `https://script.google.com/macros/s/AKfy…/exec`

### Part 3 — Connect the app

You can run the app straight from your computer first:

```bash
cd habit-quest
python3 -m http.server 8080
```

Open <http://localhost:8080> in your browser. You'll see the **Setup** screen:

1. Paste the **Web app URL** (the `/exec` link).
2. Paste your **API token** (the one you set in `Code.gs`).
3. Click **Connect 🚀**. If it works you'll see your starter habits and rewards.

> A `file://` open also works for a quick look, but use a local server (or a real host) so it becomes installable and works offline. Service workers only run on `http(s)://` and `localhost`.

### Part 4 — Put it on your phone & PCs

The app is a **PWA**, so you host the static files once and "install" it everywhere.

**Easiest: Netlify Drop (free, HTTPS, ~1 min)**
1. Go to <https://app.netlify.com/drop>.
2. Drag the whole `habit-quest` folder onto the page.
3. You get a public HTTPS URL like `https://your-name.netlify.app`.
4. Open that URL on each device and **Add to Home Screen / Install**.

**Or GitHub Pages (free):**
1. Create a GitHub repo and upload the contents of `habit-quest/`.
2. **Settings → Pages → Deploy from branch → `main` / root**.
3. Use the published `https://<you>.github.io/<repo>/` URL.

**Install it like a real app:**
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*.
- **Windows/macOS/Linux (Chrome/Edge):** the install icon in the address bar → *Install*.

Your URL + token are stored on each device the first time you connect, so you can open the same link on every device and pick up right where you left off.

---

## 🤖 Using Google Gemini with your habits

Because all of your data is in a **Google Sheet**, Gemini can read it directly — no API key and no code required.

**How to enable it**
1. In the **Gemini** app or <https://gemini.google.com>, use the **Google Workspace / `@Google Sheets`** connection (or the *Extensions → Google Workspace* setting), and make sure it can access your **Habit Quest** sheet.
2. Ask Gemini questions in plain English. A few that work well:

**Daily motivation**
> "Look at my Habit Quest sheet. What did I complete today, and give me a short, upbeat pep talk in the style of a game announcer."

**Streak support (ADHD‑friendly)**
> "Read my Log tab and tell me my current streak, my best streak, and the two habits I skip most. Suggest one tiny change to make tomorrow easier."

**Reward ideas**
> "Based on my coins balance in the User tab, suggest three rewards I could afford this week if I keep my streak."

**Weekly review**
> "Summarize my Habit Quest week: total completions per habit, best day, worst day, and pick one habit to focus on next week. Keep it encouraging."

**Make new habits**
> "Propose five very small (2‑minute) habits for an ADHD brain that fit my current categories, with suggested XP values."

> Tip: Gemini can also *write* to the sheet. You can say *"Add a new habit row called 'Stretch 2 minutes' with 10 XP"* and it will edit the Habits tab for you.

**In‑app AI (optional, later):** the backend already returns everything an AI coach would need. If you later add a Gemini API key, you can add a "Coach" button that calls the Gemini API from `app.js`. The app works fully without it.

---

## 🤖 In‑app AI coach (optional Gemini API key)

Beyond asking Gemini about your Sheet, the app can generate a personalised pep talk **inside** the app.

1. Get a free API key at <https://aistudio.google.com/app/apikey>.
2. In the app: **More (⚙️) → Gemini coach**, paste the key, and choose a model (default `gemini-2.0-flash`; you can also use `gemini-2.5-flash`, `gemini-1.5-flash`, etc.).
3. Tap **🤖 Ask your AI coach** at the top of the Today tab.

The coach reads your live stats (level, streak, coins, what's done and left today) and writes a short pep talk plus one tiny next action. The key is stored **only in your browser** (`localStorage`) and sent directly to Google's Gemini API — it never touches any other server. If a model name becomes unavailable, just update it in Settings.

> Heads‑up: a browser‑side API key is visible in dev tools. That's fine for a personal, single‑user app. If that bothers you, skip the in‑app coach and use the "ask Gemini about your Sheet" method above.

## ✏️ Editing & deleting habits

Tap the **✎** button on any habit to edit its name, emoji, category, XP and coins. The edit sheet also has **Delete habit**, which *archives* it — it disappears from your active list but your completion history and XP stay intact.

## 🎨 Dark / light theme

Go to **More (⚙️) → Appearance** and pick **🌙 Dark** or **☀️ Light**. Your choice is remembered on each device (and updates the phone's status‑bar colour).

---

## 🧠 How the gamification works (and how to tune it)

All of this lives near the top of `backend/Code.gs`.

**XP & levels** — `const LEVELS = [...]`. Each habit grants its own XP (default 10) and coins (default 5). Level is derived from total XP. Edit the titles/thresholds freely.

**Achievements** — `const ACHIEVEMENT_DEFS = [...]`. Each has a `check(context)` function. Add your own, e.g.:
```js
{ code: 'early_bird', name: 'Early Bird', desc: 'Complete a habit before 8am',
  emoji: '🌅', check: c => c.earlyBird }
```
(Then compute `earlyBird` in `buildState` if you want time‑based badges.)

**Streak freeze** — you automatically earn **1 freeze per week** (max 3). On the **More** tab you can spend one to protect yesterday if you missed it. This is deliberately forgiving for ADHD — a single off‑day shouldn't erase weeks of momentum.

**Rewards shop** — add anything you personally find rewarding, with a coin price you choose. The dopamine hit of *choosing* your own reward is part of the point.


---

## 🗂️ Data model (the Google Sheet tabs)

| Tab | Columns | Purpose |
|---|---|---|
| **Habits** | id, name, emoji, category, xp, coins, target, active, order, created_at | Your habits. `active=false` hides (archives) a habit without losing history. |
| **Log** | id, habitId, date, completed, xp, coins, timestamp | One row per habit per day. Drives streaks + heatmap. |
| **Rewards** | id, name, emoji, cost, active, created_at | Things you can buy with coins. |
| **Redemptions** | id, rewardId, date, cost, timestamp | History of rewards you've cashed in. |
| **Achievements** | code, name, dateEarned | Badges you've unlocked. |
| **User** | key, value | Name, xp, coins, level, streak freezes, etc. |

You can edit these tabs by hand (or let Gemini edit them) — the app reads them live.

---

## 🔌 API reference (what the app sends)

The app POSTs JSON to your Web App URL:

```json
{ "action": "toggleHabit", "token": "YOUR_TOKEN", "today": "2026-02-11",
  "payload": { "habitId": "…" } }
```

Available actions: `getState`, `addHabit`, `updateHabit`, `deleteHabit`, `toggleHabit`, `addReward`, `updateReward`, `deleteReward`, `redeemReward`, `useStreakFreeze`, `setName`.

You can test the backend in a browser by opening the `/exec` URL directly — it returns `{"ok":true,"service":"Habit Quest API",...}`.

---

## 🛠️ Troubleshooting

**"Could not connect" on the Setup screen**
- Make sure you deployed as **Web app** with **Execute as: Me** and **Who has access: Anyone**, and you pasted the URL ending in **`/exec`** (not `/dev`).
- Re‑check the token matches `API_TOKEN` in `Code.gs` exactly (no extra spaces).
- After **any edit** to `Code.gs`, redeploy: **Deploy → Manage deployments → ✏️ → New version → Deploy**. (Editing alone does not update the live URL.)

**Changes don't sync between devices**
- Confirm both devices use the *same* `/exec` URL + token, and that the app shows your real habits (not the offline cache). Pull to refresh / reopen the app.

**I broke my deployment / want to start over**
- In Apps Script: **Deploy → Manage deployments → archive**, then create a new deployment. Your Sheet data is untouched.

**Timezone / "today" looks wrong**
- The app sends each device's local date, so streaks follow *your* local day. If you edit the Sheet by hand, keep dates as `YYYY-MM-DD`.

**Offline**
- The app shell is cached by the service worker. You can open it offline and see your last snapshot, but completing habits needs a connection to write to the Sheet.

---

## 🔒 Security notes

- This is a **single‑user** app. The backend trusts a shared `API_TOKEN`.
- Deploying as "Anyone" lets the browser call the API without a Google sign‑in; the token is what stops strangers from writing to your sheet.
- Use a long random token (e.g. 40+ characters) and don't share your `/exec` URL + token together.
- Only you can read the Google Sheet itself; the token only gates the app's API.

---

## 🎨 Customisation ideas

- Swap the emojis in `app.js` (`HABIT_EMOJIS`, `REWARD_EMOJIS`) for your own.
- Change the accent colours in the `:root` block of `styles.css`.
- Regenerate app icons: `cd icons && python3 gen_icons.py`.
- Add a habit that rewards you for *resting* — recovery is part of the game.

Built with plain HTML/CSS/JS + a single Apps Script file — no build tools, no accounts, no subscriptions. Have fun leveling up. 🚀

