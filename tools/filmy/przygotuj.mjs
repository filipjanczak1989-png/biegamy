// FILMY (1.11.2026) — przygotowanie filmu do kafla cytatu na Dziś (FILMY_PROMO w sb.js).
//   node tools/filmy/przygotuj.mjs <wejście.mp4> <id> [katalog_wyjścia=../biegamy-assets/filmy]
// Wynik: <id>.mp4 (h264 high, yuv420p, 960 px szer., crf 28, faststart, BEZ audio), <id>.webm (VP9, bez audio),
// <id>-poster.jpg (klatka 0 — wejście filmu bez skoku, poprawka Filipa 1.11). Film NIE jest przycinany ani kadrowany — kadr ustawia CSS (object-position).
// Cel rozmiaru: mp4 ≤ 1,2 MB; gdy większy, kolejne próby crf +2 (do 34). Wymaga ffmpeg/ffprobe w PATH (scoop install ffmpeg).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [wej, id, kat = path.join(process.cwd(), "..", "biegamy-assets", "filmy")] = process.argv.slice(2);
if (!wej || !/^film-\d{2}$/.test(id || "")) { console.error("użycie: przygotuj.mjs <wejście.mp4> film-NN [katalog]"); process.exit(1); }
const CEL_B = 1.2 * 1024 * 1024, SZER = 960;
fs.mkdirSync(kat, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const czas = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wej]).toString().trim());

const mp4 = path.join(kat, `${id}.mp4`), webm = path.join(kat, `${id}.webm`), poster = path.join(kat, `${id}-poster.jpg`);
let crf = 28;
for (;;) {
  ff(["-i", wej, "-an", "-vf", `scale=${SZER}:-2`, "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", String(crf), "-movflags", "+faststart", mp4]);
  if (fs.statSync(mp4).size <= CEL_B || crf >= 34) break;
  crf += 2;
}
ff(["-i", wej, "-an", "-vf", `scale=${SZER}:-2`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-deadline", "good", webm]);
ff(["-i", wej, "-frames:v", "1", "-vf", `scale=${SZER}:-2`, "-q:v", "3", poster]);
const kb = (p) => Math.round(fs.statSync(p).size / 1024);
console.log(JSON.stringify({ id, czas_s: Math.round(czas * 100) / 100, crf, mp4_kb: kb(mp4), webm_kb: kb(webm), poster_kb: kb(poster), cel_kb: Math.round(CEL_B / 1024) }));
