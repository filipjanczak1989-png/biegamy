// FILMY (1.11.2026) — przygotowanie filmu do kafla cytatu na Dziś (FILMY_PROMO w sb.js).
//   node tools/filmy/przygotuj.mjs <wejście.mp4> <id> [katalog_wyjścia=../biegamy-assets/filmy]
// Wynik: <id>.mp4 (h264 high, yuv420p, 960 px szer., crf 28, faststart, audio AAC 96k gdy wejście ma dźwięk — od 2.11, film-03),
//        <id>.webm (VP9 + Opus 64k),
// <id>-poster.jpg (klatka 0 — wejście filmu bez skoku, poprawka Filipa 1.11). Film NIE jest przycinany ani kadrowany — kadr ustawia CSS (object-position).
// Cel rozmiaru: mp4 ≤ 1,2 MB; gdy większy, kolejne próby crf +2 (do 34). Wymaga ffmpeg/ffprobe w PATH (scoop install ffmpeg).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2), opcja = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const poz = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const [wej, id, kat = path.join(process.cwd(), "..", "biegamy-assets", "filmy")] = poz;
if (!wej || !/^film-\d{2}$/.test(id || "")) { console.error("użycie: przygotuj.mjs <wejście.mp4> film-NN [katalog] [--cel-mb 1.2] [--crf 28] [--szer 960]"); process.exit(1); }
/* --cel-mb: cel rozmiaru mp4 (film-05 promo 43 s: 4 MB, Filip 3.11); --crf: start (niżej = lepsza jakość twarzy); --szer: szerokość px */
const CEL_B = (Number(opcja("--cel-mb", 1.2)) || 1.2) * 1024 * 1024, SZER = Number(opcja("--szer", 960)) || 960, CRF_START = Number(opcja("--crf", 28)) || 28;
fs.mkdirSync(kat, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const czas = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wej]).toString().trim());
const maAudio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", wej]).toString().includes("audio");
const audioMp4 = maAudio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : ["-an"], audioWebm = maAudio ? ["-c:a", "libopus", "-b:a", "64k", "-ac", "2"] : ["-an"];

const mp4 = path.join(kat, `${id}.mp4`), webm = path.join(kat, `${id}.webm`), poster = path.join(kat, `${id}-poster.jpg`);
let crf = CRF_START;
for (;;) {
  ff(["-i", wej, ...audioMp4, "-vf", `scale=${SZER}:-2`, "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", String(crf), "-movflags", "+faststart", mp4]);
  if (fs.statSync(mp4).size <= CEL_B || crf >= CRF_START + 6) break;
  crf += 2;
}
// VP9: crf ≈ h264 crf + 8–10 przy podobnej jakości (film-05: 24 → 32)
ff(["-i", wej, ...audioWebm, "-vf", `scale=${SZER}:-2`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(Math.max(30, crf + 8)), "-row-mt", "1", "-deadline", "good", webm]);
ff(["-i", wej, "-frames:v", "1", "-vf", `scale=${SZER}:-2`, "-q:v", "3", poster]);
const kb = (p) => Math.round(fs.statSync(p).size / 1024);
console.log(JSON.stringify({ id, audio: maAudio, czas_s: Math.round(czas * 100) / 100, crf, mp4_kb: kb(mp4), webm_kb: kb(webm), poster_kb: kb(poster), cel_kb: Math.round(CEL_B / 1024) }));
