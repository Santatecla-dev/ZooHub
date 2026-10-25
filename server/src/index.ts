import cors from 'cors'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { initialiseDatabase, pool } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)
const sessions = new Map<string, string>()

type PublicUser = { id: string; name: string; bio: string; email?: string; avatar_url?: string; album_count?: number; photo_count?: number }

function publicUser(row: PublicUser) {
  return { id: row.id, name: row.name, bio: row.bio, email: row.email ?? '', avatar_url: row.avatar_url ?? '', album_count: row.album_count ?? 0, photo_count: row.photo_count ?? 0 }
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(':')
  if (!salt || !key) return false
  const expected = Buffer.from(key, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sessionUser(request: express.Request) {
  const header = request.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  return token ? sessions.get(token) : undefined
}

function requireSession(request: express.Request, response: express.Response) {
  const userId = sessionUser(request)
  if (!userId) {
    response.status(401).json({ message: 'You need to sign in.' })
    return undefined
  }
  return userId
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? /^https?:\/\/(localhost|127\.0\.0\.1):517[0-9]$/ }))
// Permitir imágenes en base64 para subida de fotos locales
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Healthcheck
app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'error', database: 'disconnected' })
  }
})

// ==========================================
// AUTENTICACIÓN (registro, login y logout)
// ==========================================

app.get('/api/auth/me', async (request, response) => {
  const userId = requireSession(request, response)
  if (!userId) return
  try {
    const { rows } = await pool.query<PublicUser>('SELECT id, name, bio, email, avatar_url FROM users WHERE id = $1', [userId])
    if (!rows[0]) {
      response.status(401).json({ message: 'This session is no longer valid.' })
      return
    }
    response.json(publicUser(rows[0]))
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not restore the session.' })
  }
})

app.post('/api/auth/register', async (request, response) => {
  const { id, name, email, password, bio = '' } = request.body as Record<string, string>
  const cleanId = id?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const cleanEmail = email?.trim().toLowerCase()

  if (!cleanId || cleanId.length < 3 || !name?.trim() || !cleanEmail || !password) {
    response.status(400).json({ message: 'User ID, name, email and password are required.' })
    return
  }
  if (password.length < 8) {
    response.status(400).json({ message: 'Password must be at least 8 characters long.' })
    return
  }

  try {
    const existing = await pool.query<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM users WHERE id = $1 OR LOWER(email) = $2', [cleanId, cleanEmail])
    const conflicting = existing.rows.find((row) => row.id !== cleanId || row.password_hash)
    if (conflicting) {
      response.status(409).json({ message: 'That user ID or email is already registered.' })
      return
    }

    const { rows } = await pool.query<PublicUser>(`
      INSERT INTO users (id, name, bio, email, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, bio = EXCLUDED.bio, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash
      RETURNING id, name, bio, email, avatar_url
    `, [cleanId, name.trim(), bio.trim(), cleanEmail, hashPassword(password)])
    const token = randomBytes(32).toString('hex')
    sessions.set(token, rows[0].id)
    response.status(201).json({ token, user: publicUser(rows[0]) })
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'The account could not be created.' })
  }
})

app.post('/api/auth/login', async (request, response) => {
  const { identifier, password } = request.body as { identifier?: string; password?: string }
  if (!identifier?.trim() || !password) {
    response.status(400).json({ message: 'Enter your user ID or email and your password.' })
    return
  }
  try {
    const { rows } = await pool.query<PublicUser & { password_hash: string | null }>('SELECT id, name, bio, email, avatar_url, password_hash FROM users WHERE id = $1 OR LOWER(email) = LOWER($1) LIMIT 1', [identifier.trim()])
    const account = rows[0]
    if (!account?.password_hash || !verifyPassword(password, account.password_hash)) {
      response.status(401).json({ message: 'Incorrect ID/email or password.' })
      return
    }
    const token = randomBytes(32).toString('hex')
    sessions.set(token, account.id)
    response.json({ token, user: publicUser(account) })
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not sign in.' })
  }
})

app.post('/api/auth/logout', (request, response) => {
  const header = request.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (token) sessions.delete(token)
  response.status(204).send()
})

// ==========================================
// USUARIOS (Cuentas de fotógrafos)
// ==========================================

// Listar fotógrafos / perfiles
app.get('/api/users', async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.bio, u.avatar_url,
        COUNT(DISTINCT a.id)::int AS album_count,
        COUNT(p.id)::int AS photo_count
      FROM users u
      LEFT JOIN albums a ON a.user_id = u.id
      LEFT JOIN album_photos p ON p.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `)
    response.json(rows)
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not load users.' })
  }
})

// Obtener o autenticar perfil por ID
app.get('/api/users/:id', async (request, response) => {
  const { id } = request.params
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.bio, u.avatar_url,
        COUNT(DISTINCT a.id)::int AS album_count,
        COUNT(p.id)::int AS photo_count
      FROM users u
      LEFT JOIN albums a ON a.user_id = u.id
      LEFT JOIN album_photos p ON p.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id])

    if (!rows[0]) {
      response.status(404).json({ message: 'Usuario no encontrado.' })
      return
    }
    response.json(rows[0])
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not load the user.' })
  }
})

// Registrar o actualizar cuenta
app.post('/api/users', async (request, response) => {
  const authenticatedUser = requireSession(request, response)
  if (!authenticatedUser) return
  const { id, name, bio = '', avatar_url = '' } = request.body as Record<string, string>
  const cleanId = id?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')

  if (cleanId !== authenticatedUser) {
    response.status(403).json({ message: 'User ID cannot be changed from the profile.' })
    return
  }
  if (!cleanId || !name?.trim()) {
    response.status(400).json({ message: 'User ID and name are required.' })
    return
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO users (id, name, bio, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url
      RETURNING id, name, bio, avatar_url
    `, [cleanId, name.trim(), bio.trim(), avatar_url.trim()])

    response.status(201).json(rows[0])
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not create or update the profile.' })
  }
})

// ==========================================
// ÁLBUMES (Públicos / Privados / Multi-país)
// ==========================================

// Explorar álbumes públicos (con filtro por texto/nombre y por ubicación/países)
app.get('/api/albums/explore', async (request, response) => {
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : ''
  const location = typeof request.query.location === 'string' ? request.query.location.trim() : ''
  const values: unknown[] = []
  const conditions: string[] = ['a.is_public = true']

  if (search) {
    values.push(`%${search}%`)
    const idx = values.length
    conditions.push(`(a.title ILIKE $${idx} OR a.description ILIKE $${idx} OR u.name ILIKE $${idx} OR u.id ILIKE $${idx})`)
  }

  if (location) {
    values.push(`%${location}%`)
    const idx = values.length
    conditions.push(`(
      EXISTS (SELECT 1 FROM unnest(a.locations) loc WHERE loc ILIKE $${idx})
      OR EXISTS (SELECT 1 FROM album_photos ap WHERE ap.album_id = a.id AND (ap.location ILIKE $${idx} OR ap.country ILIKE $${idx}))
    )`)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  try {
    const { rows } = await pool.query(`
      SELECT 
        a.id, 
        a.user_id, 
        a.title, 
        a.description, 
        a.is_public, 
        a.locations,
        TO_CHAR(a.created_at, 'DD Mon YYYY') AS date,
        u.name AS author_name,
        u.bio AS author_bio,
        u.avatar_url AS author_avatar,
        COUNT(p.id)::int AS photo_count,
        COALESCE(
          (SELECT image_url FROM album_photos WHERE album_id = a.id ORDER BY order_index ASC, id ASC LIMIT 1),
          'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=1200&q=85'
        ) AS cover_image
      FROM albums a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN album_photos p ON p.album_id = a.id
      ${whereClause}
      GROUP BY a.id, u.id
      ORDER BY a.created_at DESC
    `, values)

    response.json(rows)
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not explore albums.' })
  }
})

// Obtener los álbumes de un usuario (propios: incluye privados si solicita el dueño)
app.get('/api/users/:userId/albums', async (request, response) => {
  const { userId } = request.params
  const requesterId = typeof request.query.requester === 'string' ? request.query.requester : ''
  const isOwner = requesterId === userId && sessionUser(request) === userId

  try {
    const query = `
      SELECT 
        a.id, 
        a.user_id, 
        a.title, 
        a.description, 
        a.is_public, 
        a.locations,
        TO_CHAR(a.created_at, 'DD Mon YYYY') AS date,
        u.name AS author_name,
        COUNT(p.id)::int AS photo_count,
        COALESCE(
          (SELECT image_url FROM album_photos WHERE album_id = a.id ORDER BY order_index ASC, id ASC LIMIT 1),
          'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=1200&q=85'
        ) AS cover_image
      FROM albums a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN album_photos p ON p.album_id = a.id
      WHERE a.user_id = $1 ${isOwner ? '' : 'AND a.is_public = true'}
      GROUP BY a.id, u.id
      ORDER BY a.created_at DESC
    `
    const { rows } = await pool.query(query, [userId])
    response.json(rows)
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not load the user albums.' })
  }
})

// Obtener un álbum específico y todas sus fotos
app.get('/api/albums/:id', async (request, response) => {
  const albumId = Number(request.params.id)

  if (isNaN(albumId)) {
    response.status(400).json({ message: 'Invalid album ID.' })
    return
  }

  try {
    const albumRes = await pool.query(`
      SELECT 
        a.id, 
        a.user_id, 
        a.title, 
        a.description, 
        a.is_public, 
        a.locations,
        TO_CHAR(a.created_at, 'DD Mon YYYY') AS date,
        u.name AS author_name,
        u.bio AS author_bio
      FROM albums a
      JOIN users u ON u.id = a.user_id
      WHERE a.id = $1
    `, [albumId])

    if (!albumRes.rows[0]) {
      response.status(404).json({ message: 'Album not found.' })
      return
    }

    const album = albumRes.rows[0]
    if (!album.is_public && sessionUser(request) !== album.user_id) {
      response.status(403).json({ message: 'This album is private.' })
      return
    }

    const photosRes = await pool.query(`
      SELECT 
        id, 
        album_id, 
        user_id, 
        title, 
        order_index, 
        location, 
        country, 
        image_url AS image,
        TO_CHAR(created_at, 'DD Mon YYYY') AS date
      FROM album_photos
      WHERE album_id = $1
      ORDER BY order_index ASC, id ASC
    `, [albumId])

    // Asignar numeración por defecto si no tiene título
    const photos = photosRes.rows.map((photo, idx) => ({
      ...photo,
      display_title: photo.title && photo.title.trim() ? photo.title : `Foto #${photo.order_index ?? idx + 1}`,
    }))

    response.json({ ...album, photos })
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not load the album.' })
  }
})

// Crear nuevo álbum
app.post('/api/albums', async (request, response) => {
  const authenticatedUser = requireSession(request, response)
  if (!authenticatedUser) return
  const { userId, title, description = '', isPublic = true, locations = [] } = request.body as {
    userId: string
    title: string
    description?: string
    isPublic?: boolean
    locations?: string[]
  }

  if (!userId || userId !== authenticatedUser || !title?.trim()) {
    response.status(400).json({ message: 'User and album title are required.' })
    return
  }

  // Limpiar lista de países / ubicaciones (ej: ["Japón", "Indonesia", "México"])
  const cleanLocations = Array.isArray(locations)
    ? locations.map((loc) => loc.trim()).filter(Boolean)
    : []

  if (!cleanLocations.length) {
    response.status(400).json({ message: 'The album needs at least one country or location.' })
    return
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO albums (user_id, title, description, is_public, locations)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, title, description, is_public, locations, TO_CHAR(created_at, 'DD Mon YYYY') AS date
    `, [userId, title.trim(), description.trim(), Boolean(isPublic), cleanLocations])

    response.status(201).json(rows[0])
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not create the album.' })
  }
})

// Cambiar visibilidad (público / privado) de un álbum
app.patch('/api/albums/:id/visibility', async (request, response) => {
  const authenticatedUser = requireSession(request, response)
  if (!authenticatedUser) return
  const albumId = Number(request.params.id)
  const { userId, isPublic } = request.body as { userId: string; isPublic: boolean }

  try {
    const { rows } = await pool.query(`
      UPDATE albums
      SET is_public = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, is_public
    `, [Boolean(isPublic), albumId, authenticatedUser === userId ? authenticatedUser : ''])

    if (!rows[0]) {
      response.status(404).json({ message: 'Album not found or you are not the owner.' })
      return
    }

    response.json(rows[0])
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not update visibility.' })
  }
})

// ==========================================
// SUBIDA Y GESTIÓN DE FOTOS
// ==========================================

// Añadir foto a un álbum
app.post('/api/albums/:id/photos', async (request, response) => {
  const authenticatedUser = requireSession(request, response)
  if (!authenticatedUser) return
  const albumId = Number(request.params.id)
  const { userId, title, location, country = '', image } = request.body as {
    userId: string
    title?: string
    location: string
    country?: string
    image: string // URL o base64
  }

  if (!userId || !location?.trim() || !image?.trim()) {
    response.status(400).json({ message: 'User, specific location and photo (file or link) are required.' })
    return
  }

  try {
    // Comprobar pertenencia del álbum
    const albumCheck = await pool.query('SELECT user_id, locations FROM albums WHERE id = $1', [albumId])
    if (!albumCheck.rows[0]) {
      response.status(404).json({ message: 'Album not found.' })
      return
    }
    if (authenticatedUser !== userId || albumCheck.rows[0].user_id !== authenticatedUser) {
      response.status(403).json({ message: 'You do not have permission to add photos to this album.' })
      return
    }

    // Calcular el siguiente número de orden
    const countRes = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM album_photos WHERE album_id = $1', [albumId])
    const orderIndex = Number(countRes.rows[0]?.count ?? 0) + 1

    const finalTitle = title && title.trim() ? title.trim() : null

    const { rows } = await pool.query(`
      INSERT INTO album_photos (album_id, user_id, title, order_index, location, country, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, album_id, user_id, title, order_index, location, country, image_url AS image, TO_CHAR(created_at, 'DD Mon YYYY') AS date
    `, [albumId, authenticatedUser, finalTitle, orderIndex, location.trim(), country.trim(), image.trim()])

    // Si el país/ubicación no estaba en la lista de ubicaciones del álbum, agregarlo automáticamente
    const currentLocations: string[] = albumCheck.rows[0].locations || []
    const tagToAdd = country.trim() || location.trim()
    if (tagToAdd && !currentLocations.some((l) => l.toLowerCase() === tagToAdd.toLowerCase())) {
      await pool.query('UPDATE albums SET locations = array_append(locations, $1) WHERE id = $2', [tagToAdd, albumId])
    }

    const inserted = rows[0]
    response.status(201).json({
      ...inserted,
      display_title: inserted.title ?? `Foto #${inserted.order_index}`,
    })
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not save the photo to the album.' })
  }
})

// Borrar una foto propia de un álbum
app.delete('/api/albums/:albumId/photos/:photoId', async (request, response) => {
  const userId = requireSession(request, response)
  if (!userId) return
  const albumId = Number(request.params.albumId)
  const photoId = Number(request.params.photoId)
  if (isNaN(albumId) || isNaN(photoId)) {
    response.status(400).json({ message: 'Invalid photo ID.' })
    return
  }
  try {
    const deleted = await pool.query('DELETE FROM album_photos WHERE id = $1 AND album_id = $2 AND user_id = $3 RETURNING id', [photoId, albumId, userId])
    if (!deleted.rows[0]) {
      response.status(404).json({ message: 'Photo not found or you are not the owner.' })
      return
    }
    await pool.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY order_index ASC, id ASC) AS new_index
        FROM album_photos WHERE album_id = $1
      )
      UPDATE album_photos p SET order_index = ordered.new_index FROM ordered
      WHERE p.id = ordered.id
    `, [albumId])
    response.status(204).send()
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not delete the photo.' })
  }
})

// Endpoint legado de /api/photos para compatibilidad
app.get('/api/photos', async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        ap.id, 
        COALESCE(NULLIF(ap.title, ''), 'Captura #' || ap.order_index) AS title, 
        COALESCE(ap.country, 'Fauna') AS species, 
        a.title AS category, 
        ap.location,
        TO_CHAR(ap.created_at, 'DD Mon YYYY') AS date,
        ap.image_url AS image,
        'moss' AS accent
      FROM album_photos ap
      JOIN albums a ON a.id = ap.album_id
      WHERE a.is_public = true
      ORDER BY ap.created_at DESC
      LIMIT 24
    `)
    response.json(rows)
  } catch {
    response.json([])
  }
})

initialiseDatabase()
  .then(() => app.listen(port, () => console.log(`ZooHub API listening at http://localhost:${port}`)))
  .catch((error) => {
    console.error('Could not initialize the database.', error)
    process.exit(1)
  })

process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
