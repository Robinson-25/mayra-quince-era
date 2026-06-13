const mysql = require('mysql2/promise');
require('dotenv').config();

async function crearTablas() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
  });

  console.log('Conectado a la base de datos ✅');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS fotos_album (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slot VARCHAR(50) NOT NULL UNIQUE,
      ruta_imagen VARCHAR(255) NOT NULL,
      fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Tabla fotos_album creada ✅');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS invitados (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre_completo VARCHAR(150) NOT NULL,
      whatsapp VARCHAR(30),
      cantidad_personas INT DEFAULT 1,
      mensaje TEXT,
      estado_asistencia VARCHAR(30),
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Tabla invitados creada ✅');

  await connection.end();
  console.log('Listo, todo creado correctamente 🎉');
}

crearTablas().catch(err => {
  console.error('Error:', err.message);
});