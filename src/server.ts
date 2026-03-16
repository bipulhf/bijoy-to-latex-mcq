import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertBuffer } from "./index.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".docx") {
      cb(null, true);
    } else {
      cb(new Error("Only .docx files are supported"));
    }
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.join(__dirname, "../web")));

app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const result = await convertBuffer(req.file.buffer);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down…");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
