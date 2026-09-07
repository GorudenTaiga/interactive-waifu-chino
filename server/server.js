import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { chinoBrain } from './ai/chinoBrain.js';
import { customTts } from './voice/customTtsHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve folder static model 3D & audio
app.use('/model', express.static(path.join(rootDir, 'model')));
app.use('/audio', express.static(path.join(rootDir, 'audio')));

// In-memory session history
const sessionHistory = new Map();

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiProvider: process.env.AI_PROVIDER || 'auto',
    hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    customTtsEnabled: customTts.isEnabled()
  });
});

// API Config
app.get('/api/config', (req, res) => {
  res.json({
    aiProvider: process.env.AI_PROVIDER || 'auto',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:latest',
    hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    customTtsEnabled: customTts.isEnabled(),
    customTtsEndpoint: customTts.endpoint
  });
});

// API Chat HTTP Fallback
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    }

    const history = sessionHistory.get(sessionId) || [];
    const response = await chinoBrain.generateResponse(message, history);

    // Audio TTS jika aktif
    let audioUrl = null;
    if (customTts.isEnabled()) {
      audioUrl = await customTts.synthesize(response.text);
    }

    // Update history
    history.push({ sender: 'user', text: message });
    history.push({ sender: 'chino', text: response.text });
    if (history.length > 20) history.splice(0, history.length - 20);
    sessionHistory.set(sessionId, history);

    res.json({
      ...response,
      audioUrl
    });
  } catch (err) {
    console.error('[Server] Chat API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Real-time Handling
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client terhubung: ${socket.id}`);
  sessionHistory.set(socket.id, []);

  // Welcome event
  socket.emit('chino_response', {
    text: "Irasshaimase, Taiga-san! Selamat datang di Rabbit House. Mau menikmati kopi apa hari ini?",
    emotion: "happy",
    action: "nod",
    provider: "System Greeting"
  });

  // Event pesan dari user
  socket.on('user_message', async (data) => {
    const message = typeof data === 'string' ? data : data?.message;
    if (!message || !message.trim()) return;

    console.log(`[Socket.io] Pesan dari ${socket.id}: "${message}"`);
    
    // Kirim indikator typing
    socket.emit('chino_typing', { isTyping: true });

    try {
      const history = sessionHistory.get(socket.id) || [];
      const brainResponse = await chinoBrain.generateResponse(message, history);

      // Cek apakah ada custom voice model TTS yang aktif
      let audioUrl = null;
      if (customTts.isEnabled()) {
        audioUrl = await customTts.synthesize(brainResponse.text);
      }

      // Update history
      history.push({ sender: 'user', text: message });
      history.push({ sender: 'chino', text: brainResponse.text });
      if (history.length > 20) history.splice(0, history.length - 20);
      sessionHistory.set(socket.id, history);

      socket.emit('chino_typing', { isTyping: false });
      socket.emit('chino_response', {
        ...brainResponse,
        audioUrl
      });
    } catch (err) {
      console.error('[Socket.io] Error processing message:', err);
      socket.emit('chino_typing', { isTyping: false });
      socket.emit('chino_response', {
        text: "Gomen nasai, Taiga-san... Sepertinya ada sedikit gangguan teknis.",
        emotion: "pout",
        action: "idle",
        provider: "Error Fallback"
      });
    }
  });

  // Reset chat memory
  socket.on('reset_history', () => {
    sessionHistory.set(socket.id, []);
    socket.emit('history_cleared', { success: true });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client terputus: ${socket.id}`);
    sessionHistory.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`
  ☕ ========================================== ☕
     KAFUU CHINO 3D INTERAKTIF SERVER RUNNING
     Port: http://localhost:${PORT}
     AI Provider: ${process.env.AI_PROVIDER || 'auto'}
     OpenAI Key: ${process.env.OPENAI_API_KEY ? 'Terpasang' : 'Tidak Ada (Auto Fallback)'}
     Custom TTS: ${customTts.isEnabled() ? 'Aktif' : 'Non-aktif (Browser Web Speech)'}
  ☕ ========================================== ☕
  `);
});
