const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// MySQL (Aiven en producción, local en desarrollo)
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

// Carpeta donde se guardan las fotos del álbum
const albumDir = path.join(__dirname, 'imagen', 'album');
if (!fs.existsSync(albumDir)) fs.mkdirSync(albumDir, { recursive: true });

// Configuración de multer para fotos del álbum
const albumStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, albumDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = 'foto_' + Date.now() + '_' + Math.round(Math.random() * 1000) + ext;
    cb(null, nombre);
  }
});
const uploadAlbum = multer({
  storage: albumStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB máx
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = /jpeg|jpg|png|webp|gif/;
    const extOk = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = tiposPermitidos.test(file.mimetype);
    if (extOk && mimeOk) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
  }
});

// SUBIR FOTO AL ÁLBUM (con slot para identificar cada espacio)
app.post('/subir_foto', uploadAlbum.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    const slot = req.body.slot || 'general';
    const rutaImagen = '/imagen/album/' + req.file.filename;

    const [existing] = await pool.query('SELECT id, ruta_imagen FROM fotos_album WHERE slot = ?', [slot]);
    if (existing.length > 0) {
      const oldPath = path.join(__dirname, existing[0].ruta_imagen);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await pool.query('UPDATE fotos_album SET ruta_imagen = ?, fecha_subida = NOW() WHERE slot = ?', [rutaImagen, slot]);
    } else {
      await pool.query('INSERT INTO fotos_album (slot, ruta_imagen) VALUES (?, ?)', [slot, rutaImagen]);
    }

    res.json({ ok: true, ruta_imagen: rutaImagen, slot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al subir la foto' });
  }
});

// MANEJO DE ERRORES DE MULTER (archivo muy grande, tipo no permitido, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('imágenes')) {
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
    const [rows] = await pool.query('SELECT ruta_imagen FROM fotos_album WHERE id = ?', [id]);
    if (rows.length > 0) {
      const filePath = path.join(__dirname, rows[0].ruta_imagen);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await pool.query('DELETE FROM fotos_album WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

// ===== INVITADOS =====

// Confirmar asistencia
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

// Obtener invitados
app.get('/obtener_invitados', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invitados ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar invitado
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