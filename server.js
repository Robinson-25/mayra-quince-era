const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = /jpeg|jpg|png|webp|gif/;
    const extOk = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = tiposPermitidos.test(file.mimetype);
    if (extOk && mimeOk) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// MySQL
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quinceanera_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

// ===== ÁLBUM DE FOTOS =====

// SUBIR FOTO (guardada como base64 en MySQL)
app.post('/subir_foto', upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    const slot = req.body.slot || 'general';
    
    // Convertir imagen a base64
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const imageData = `data:${mimeType};base64,${base64}`;

    const [existing] = await pool.query('SELECT id FROM fotos_album WHERE slot = ?', [slot]);
    if (existing.length > 0) {
      await pool.query('UPDATE fotos_album SET ruta_imagen = ?, fecha_subida = NOW() WHERE slot = ?', [imageData, slot]);
    } else {
      await pool.query('INSERT INTO fotos_album (slot, ruta_imagen) VALUES (?, ?)', [slot, imageData]);
    }

    res.json({ ok: true, ruta_imagen: imageData, slot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al subir la foto' });
  }
});

// MANEJO DE ERRORES DE MULTER
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || (err.message && err.message.includes('imágenes'))) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// OBTENER TODAS LAS FOTOS
app.get('/obtener_fotos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fotos_album ORDER BY fecha_subida DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener fotos' });
  }
});

// ELIMINAR FOTO
app.delete('/eliminar_foto/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM fotos_album WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

// ===== INVITADOS =====

app.post('/procesar_confirmacion', upload.none(), async (req, res) => {
  const { nombre_completo, whatsapp, personas_asistiran, mensaje, asistencia } = req.body;
  const estado = asistencia ? 'Confirmado' : 'No asistirá';
  try {
    await pool.query(
      'INSERT INTO invitados (nombre_completo, whatsapp, cantidad_personas, mensaje, estado_asistencia) VALUES (?,?,?,?,?)',
      [nombre_completo, whatsapp, personas_asistiran, mensaje, estado]
    );
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/obtener_invitados', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invitados ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/eliminar_invitado/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM invitados WHERE id = ?', [id]);
    res.json({ status: 'success' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));