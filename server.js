const express = require('express');
const multer = require('multer');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Multer: store upload in temp dir
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

const OVERLAY_PATH = path.join(__dirname, 'overlay.png');

app.post('/process', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `output_${Date.now()}.mp4`);

  // FFmpeg command:
  // 1. scale video to 1080x1920 (9:16), crop if needed
  // 2. apply grayscale filter
  // 3. overlay the PNG (vignette + text) on top
  ffmpeg(inputPath)
    .input(OVERLAY_PATH)
    .complexFilter([
      // Scale and crop input video to 1080x1920
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p,hue=s=0[bw]',
      // Overlay the PNG on top of the B&W video
      '[bw][1:v]overlay=0:0[out]'
    ])
    .outputOptions([
      '-map [out]',
      '-map 0:a?',          // include audio if present
      '-c:v libx264',
      '-preset fast',
      '-crf 22',
      '-c:a aac',
      '-movflags +faststart',
    ])
    .output(outputPath)
    .on('start', (cmd) => console.log('FFmpeg started:', cmd))
    .on('progress', (p) => console.log('Progress:', p.percent?.toFixed(1) + '%'))
    .on('end', () => {
      console.log('Processing complete:', outputPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="historias-coracao.mp4"');

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on('end', () => {
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
      });
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err);
      fs.unlink(inputPath, () => {});
      res.status(500).json({ error: 'Erro ao processar vídeo: ' + err.message });
    })
    .run();
});

app.listen(PORT, () => {
  console.log(`\n🎬 Histórias do Coração — Novo Nordisk`);
  console.log(`✅ Servidor rodando em http://localhost:${PORT}\n`);
});
