import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://zoohub:zoohub_dev@localhost:55432/zoohub',
})

export async function initialiseDatabase() {
  // Tablas principales para red social de fotógrafos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT DEFAULT '',
      email VARCHAR(254),
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS albums (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      description TEXT DEFAULT '',
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      locations TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS album_photos (
      id SERIAL PRIMARY KEY,
      album_id INT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(180),
      order_index INT NOT NULL DEFAULT 1,
      location VARCHAR(180) NOT NULL,
      country VARCHAR(100) DEFAULT '',
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Mantener compatibilidad con tabla photos anterior si existía
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      species VARCHAR(120) NOT NULL,
      category VARCHAR(40) NOT NULL CHECK (category IN ('Mamíferos', 'Aves', 'Paisajes')),
      location VARCHAR(180) NOT NULL,
      captured_at DATE NOT NULL,
      image_url TEXT NOT NULL,
      accent VARCHAR(30) NOT NULL DEFAULT 'moss',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  // Migración segura para bases de datos creadas antes de incorporar el login.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
  `)

  // Semilla de usuarios iniciales si no existen
  const userCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users')
  if (userCount.rows[0]?.count === '0') {
    await pool.query(`
      INSERT INTO users (id, name, bio)
      VALUES
        ('lucia_martin', 'Lucía Martín', 'Wildlife and conservation photographer. Looking for soft light and quiet eyes in the wildest places.'),
        ('carlos_safari', 'Carlos Mendoza', 'Biologist and nature documentarian specializing in savanna mammals and primates across Asia and the Americas.'),
        ('elena_wild', 'Elena Vives', 'Observer of migratory birds and boreal landscapes, from the Arctic to the Mediterranean.')
    `)

    // Semilla de álbumes
    const albumRes = await pool.query<{ id: number }>(`
      INSERT INTO albums (user_id, title, description, is_public, locations)
      VALUES
        ('lucia_martin', 'Forest Eyes and Mist', 'Intimate encounters with Iberian and European wildlife.', true, ARRAY['Spain', 'Norway']),
        ('carlos_safari', 'Primates and Big Cats of the World', 'A journey through jungles and savannas documenting remarkable species.', true, ARRAY['Japan', 'Indonesia', 'Mexico', 'Kenya']),
        ('lucia_martin', 'Private Draft / Night Project', 'Field tests and unpublished photographs still in progress.', false, ARRAY['Spain']),
        ('elena_wild', 'Northern Birds and Wetlands', 'Migration, water reflections and winter plumage.', true, ARRAY['Spain', 'Japan'])
      RETURNING id
    `)

    const [a1, a2, a3, a4] = albumRes.rows.map((r) => r.id)

    // Fotos de álbumes (algunas con título propio y otras automáticas numeradas)
    await pool.query(`
      INSERT INTO album_photos (album_id, user_id, title, order_index, location, country, image_url)
      VALUES
        (${a1}, 'lucia_martin', 'Forest Gaze', 1, 'Sierra de Andújar, Jaén', 'Spain', 'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=1200&q=85'),
        (${a1}, 'lucia_martin', 'Into the Mist', 2, 'Somiedo Park, Asturias', 'Spain', 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=1200&q=85'),
        (${a1}, 'lucia_martin', 'White Silence', 3, 'Svalbard Archipelago', 'Norway', 'https://images.unsplash.com/photo-1516939884455-1445c8652f83?auto=format&fit=crop&w=1200&q=85'),
        
        (${a2}, 'carlos_safari', 'Snow Monkey at the Onsen', 1, 'Jigokudani Valley, Nagano', 'Japan', 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=85'),
        (${a2}, 'carlos_safari', '', 2, 'Ubud Forest, Bali', 'Indonesia', 'https://images.unsplash.com/photo-1570288685369-f7305163d0e3?auto=format&fit=crop&w=1200&q=85'),
        (${a2}, 'carlos_safari', 'Howler Monkey in the Jungle', 3, 'Palenque, Chiapas', 'Mexico', 'https://images.unsplash.com/photo-1501706362039-c06b2d715385?auto=format&fit=crop&w=1200&q=85'),
        (${a2}, 'carlos_safari', 'Savanna Sentinel', 4, 'Masai Mara Reserve', 'Kenya', 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=1200&q=85'),

        (${a3}, 'lucia_martin', 'Night Sensor Study', 1, 'Monfragüe, Cáceres', 'Spain', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=85'),

        (${a4}, 'elena_wild', 'The Leap', 1, 'Ebro Delta, Tarragona', 'Spain', 'https://images.unsplash.com/photo-1480044965905-02098d419e96?auto=format&fit=crop&w=1200&q=85'),
        (${a4}, 'elena_wild', 'Snowy Owl in a Blizzard', 2, 'Hokkaido Plains', 'Japan', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=85')
    `)
  }
}
