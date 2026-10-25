import { useEffect, useMemo, useState } from 'react'
import './App.css'

type User = { id: string; name: string; bio: string; email?: string; avatar_url?: string; album_count?: number; photo_count?: number }
type AuthResponse = { token: string; user: User }
type Photo = { id: number; album_id?: number; title?: string | null; display_title?: string; order_index?: number; location: string; country?: string; image: string; date?: string }
type Album = { id: number; user_id: string; title: string; description?: string; is_public: boolean; locations: string[]; date?: string; author_name?: string; author_bio?: string; author_avatar?: string; photo_count?: number; cover_image?: string; photos?: Photo[] }
type ModalName = 'album' | 'photo' | null
type TabName = 'albums' | 'explore' | 'profile'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

const fallbackUsers: User[] = [
  { id: 'lucia_martin', name: 'Lucía Martín', bio: 'Wildlife and conservation photographer. Looking for soft light and quiet eyes.', album_count: 2, photo_count: 4 },
  { id: 'carlos_safari', name: 'Carlos Mendoza', bio: 'Biologist and nature documentarian specializing in savanna mammals and primates.', album_count: 1, photo_count: 4 },
  { id: 'elena_wild', name: 'Elena Vives', bio: 'Observer of migratory birds and boreal landscapes.', album_count: 1, photo_count: 2 },
]

const fallbackAlbums: Album[] = [
  { id: 1, user_id: 'lucia_martin', title: 'Forest Eyes and Mist', description: 'Intimate encounters with Iberian and European wildlife.', is_public: true, locations: ['Spain', 'Norway'], photo_count: 3, cover_image: 'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=1200&q=85', author_name: 'Lucía Martín' },
  { id: 2, user_id: 'carlos_safari', title: 'Primates and Big Cats of the World', description: 'A journey through jungles and savannas documenting remarkable species.', is_public: true, locations: ['Japan', 'Indonesia', 'Mexico', 'Kenya'], photo_count: 4, cover_image: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=85', author_name: 'Carlos Mendoza' },
  { id: 3, user_id: 'lucia_martin', title: 'Private Draft / Night Project', description: 'Field tests and unpublished photographs still in progress.', is_public: false, locations: ['Spain'], photo_count: 1, cover_image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=85', author_name: 'Lucía Martín' },
  { id: 4, user_id: 'elena_wild', title: 'Northern Birds and Wetlands', description: 'Migration, water reflections and winter plumage.', is_public: true, locations: ['Spain', 'Japan'], photo_count: 2, cover_image: 'https://images.unsplash.com/photo-1480044965905-02098d419e96?auto=format&fit=crop&w=1200&q=85', author_name: 'Elena Vives' },
]

const fallbackPhotos: Record<number, Photo[]> = {
  1: [
    { id: 1, title: 'Forest Gaze', display_title: 'Forest Gaze', order_index: 1, location: 'Sierra de Andújar, Jaén', country: 'Spain', image: 'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=1200&q=85' },
    { id: 2, title: 'Into the Mist', display_title: 'Into the Mist', order_index: 2, location: 'Somiedo Park, Asturias', country: 'Spain', image: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=1200&q=85' },
    { id: 3, title: 'White Silence', display_title: 'White Silence', order_index: 3, location: 'Svalbard Archipelago', country: 'Norway', image: 'https://images.unsplash.com/photo-1516939884455-1445c8652f83?auto=format&fit=crop&w=1200&q=85' },
  ],
  2: [
    { id: 4, title: 'Snow Monkey at the Onsen', display_title: 'Snow Monkey at the Onsen', order_index: 1, location: 'Jigokudani Valley, Nagano', country: 'Japan', image: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=85' },
    { id: 5, order_index: 2, location: 'Ubud Forest, Bali', country: 'Indonesia', image: 'https://images.unsplash.com/photo-1570288685369-f7305163d0e3?auto=format&fit=crop&w=1200&q=85' },
    { id: 6, title: 'Howler Monkey in the Jungle', display_title: 'Howler Monkey in the Jungle', order_index: 3, location: 'Palenque, Chiapas', country: 'Mexico', image: 'https://images.unsplash.com/photo-1501706362039-c06b2d715385?auto=format&fit=crop&w=1200&q=85' },
  ],
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('zoohub.session')
  const response = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) }, ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? 'The operation could not be completed.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }

function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('zoohub.session')
    if (!token) { setCheckingSession(false); return }
    apiFetch<User>('/api/auth/me').then(setAuthUser).catch(() => sessionStorage.removeItem('zoohub.session')).finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) return <div className="auth-loading"><span className="brand-mark">✦</span><p>Opening your archive…</p></div>
  if (!authUser) return <AuthScreen onAuthenticated={(user, token) => { sessionStorage.setItem('zoohub.session', token); setAuthUser(user) }} />
  return <Workspace initialUser={authUser} onLogout={() => setAuthUser(null)} />
}

function Workspace({ initialUser, onLogout }: { initialUser: User; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabName>('albums')
  const [users, setUsers] = useState<User[]>([initialUser, ...fallbackUsers.filter((user) => user.id !== initialUser.id)])
  const [currentUserId, setCurrentUserId] = useState(initialUser.id)
  const [albums, setAlbums] = useState<Album[]>(fallbackAlbums.filter((album) => album.user_id === initialUser.id))
  const [exploreAlbums, setExploreAlbums] = useState<Album[]>(fallbackAlbums.filter((album) => album.is_public))
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [modal, setModal] = useState<ModalName>(null)
  const [search, setSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const currentUser = users.find((user) => user.id === currentUserId) ?? initialUser

  const refreshAlbums = async (userId = currentUserId) => {
    try { setAlbums(await apiFetch<Album[]>(`/api/users/${encodeURIComponent(userId)}/albums?requester=${encodeURIComponent(userId)}`)) }
    catch { setAlbums(fallbackAlbums.filter((album) => album.user_id === userId)) }
  }

  useEffect(() => {
    let mounted = true
    Promise.all([apiFetch<User[]>('/api/users'), apiFetch<Album[]>('/api/albums/explore')]).then(([userData, albumData]) => {
      if (!mounted) return
      if (userData.length) setUsers(userData)
      if (albumData.length) setExploreAlbums(albumData)
    }).catch(() => undefined).finally(() => { if (mounted) setLoading(false) })
    void refreshAlbums()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    void refreshAlbums(currentUserId)
    setSelectedAlbum(null)
  }, [currentUserId])

  const filteredExploreAlbums = useMemo(() => {
    const term = search.trim().toLowerCase(); const place = locationSearch.trim().toLowerCase()
    return exploreAlbums.filter((album) => {
      const haystack = `${album.title} ${album.description ?? ''} ${album.author_name ?? ''} ${album.user_id}`.toLowerCase()
      const locations = (album.locations ?? []).join(' ').toLowerCase()
      return (!term || haystack.includes(term)) && (!place || locations.includes(place))
    })
  }, [exploreAlbums, locationSearch, search])

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const openAlbum = async (album: Album) => {
    try { setSelectedAlbum(await apiFetch<Album>(`/api/albums/${album.id}?requester=${encodeURIComponent(currentUserId)}`)) }
    catch { setSelectedAlbum({ ...album, photos: fallbackPhotos[album.id] ?? [] }) }
  }
  const toggleVisibility = async (album: Album) => {
    const nextValue = !album.is_public
    try { await apiFetch(`/api/albums/${album.id}/visibility`, { method: 'PATCH', body: JSON.stringify({ userId: currentUserId, isPublic: nextValue }) }) } catch { /* modo demo */ }
    const update = (item: Album) => item.id === album.id ? { ...item, is_public: nextValue } : item
    setAlbums((items) => items.map(update))
    setExploreAlbums((items) => nextValue ? items.some((item) => item.id === album.id) ? items.map(update) : [...items, { ...album, is_public: true }] : items.filter((item) => item.id !== album.id))
    setSelectedAlbum((item) => item?.id === album.id ? { ...item, is_public: nextValue } : item)
    showNotice(nextValue ? 'Album published to Explore.' : 'Album saved as private.')
  }
  const saveProfile = async (profile: User) => {
    const cleanId = profile.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!cleanId || !profile.name.trim()) { showNotice('User ID and name are required.'); return }
    try {
      const saved = await apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify({ ...profile, id: cleanId }) })
      setUsers((items) => [...items.filter((user) => user.id !== saved.id), saved]); setCurrentUserId(saved.id); showNotice('Profile saved. You can now create your first album.')
    } catch {
      setUsers((items) => [...items.filter((user) => user.id !== cleanId), { ...profile, id: cleanId }]); setCurrentUserId(cleanId); showNotice('Profile saved for this session. Connect the API to make it permanent.')
    }
  }
  const createAlbum = async (data: { title: string; description: string; locations: string[]; isPublic: boolean }) => {
    try {
      const created = await apiFetch<Album>('/api/albums', { method: 'POST', body: JSON.stringify({ userId: currentUserId, ...data }) })
      setAlbums((items) => [created, ...items]); setExploreAlbums((items) => data.isPublic ? [created, ...items] : items); setModal(null); showNotice('Album created. Add your first photos.')
    } catch {
      const created: Album = { title: data.title, description: data.description, locations: data.locations, is_public: data.isPublic, id: Date.now(), user_id: currentUserId, photo_count: 0, author_name: currentUser.name, cover_image: '' }
      setAlbums((items) => [created, ...items]); if (created.is_public) setExploreAlbums((items) => [created, ...items]); setModal(null); showNotice('Album created for this session. Connect the API to save it in PostgreSQL.')
    }
  }
  const addPhoto = async (album: Album, data: { title: string; location: string; country: string; image: string }) => {
    try {
      const saved = await apiFetch<Photo>(`/api/albums/${album.id}/photos`, { method: 'POST', body: JSON.stringify({ userId: currentUserId, ...data }) })
      setSelectedAlbum((item) => item?.id === album.id ? { ...item, photos: [...(item.photos ?? []), saved], photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)
      setAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)); setExploreAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)); setModal(null); showNotice('Photo added to the album.')
    } catch {
      const saved: Photo = { ...data, id: Date.now(), order_index: (album.photos?.length ?? album.photo_count ?? 0) + 1, display_title: data.title || `Foto #${(album.photos?.length ?? album.photo_count ?? 0) + 1}` }
      setSelectedAlbum((item) => item?.id === album.id ? { ...item, photos: [...(item.photos ?? []), saved], photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)
      setAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)); setExploreAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: (item.photo_count ?? 0) + 1, cover_image: item.cover_image || saved.image } : item)); setModal(null); showNotice('Photo added for this session. Connect the API to save it in PostgreSQL.')
    }
  }
  const deletePhoto = async (album: Album, photo: Photo) => {
    if (!window.confirm(`Delete "${photo.display_title || photo.title || `Photo #${photo.order_index ?? ''}`}"?`)) return
    try { await apiFetch(`/api/albums/${album.id}/photos/${photo.id}`, { method: 'DELETE' }) } catch { /* permite borrar la vista de demo aunque la API no responda */ }
    setSelectedAlbum((item) => item?.id === album.id ? { ...item, photos: (item.photos ?? []).filter((itemPhoto) => itemPhoto.id !== photo.id), photo_count: Math.max(0, (item.photo_count ?? 1) - 1) } : item)
    setAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: Math.max(0, (item.photo_count ?? 1) - 1) } : item))
    setExploreAlbums((items) => items.map((item) => item.id === album.id ? { ...item, photo_count: Math.max(0, (item.photo_count ?? 1) - 1) } : item))
    showNotice('Photo deleted from the album.')
  }
  const navigate = (tab: TabName) => { setActiveTab(tab); setSelectedAlbum(null) }
  const logout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }) } catch { /* the local session can still be closed if the API is unavailable */ }
    sessionStorage.removeItem('zoohub.session')
    onLogout()
  }

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">✦</span><span>Zoo<span className="brand-accent">Hub</span></span></div><p className="sidebar-kicker">SOCIAL NETWORK / PHOTOGRAPHY</p><nav className="main-nav" aria-label="Main navigation"><button className={`nav-item ${activeTab === 'albums' ? 'active' : ''}`} onClick={() => navigate('albums')}><span className="nav-icon">▦</span> My albums <span className="nav-count">{albums.length.toString().padStart(2, '0')}</span></button><button className={`nav-item ${activeTab === 'explore' ? 'active' : ''}`} onClick={() => navigate('explore')}><span className="nav-icon">⌕</span> Explore albums</button><button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')}><span className="nav-icon">◉</span> My profile</button></nav><div className="sidebar-bottom"><div className="network-note"><span className="network-dot" /> Open community</div><button className="profile-button" onClick={() => navigate('profile')}><span className="avatar">{initials(currentUser.name)}</span><span><strong>{currentUser.name}</strong><small>@{currentUser.id}</small></span><span className="dots">···</span></button><button className="logout-button" onClick={() => void logout()}>↪ Log out</button></div></aside>
    <main className="content"><header className="topbar"><div className="breadcrumb">ZOOHUB <span>/</span> {activeTab === 'albums' ? 'MY COLLECTION' : activeTab === 'explore' ? 'DISCOVER' : 'PROFILE'}</div><div className="top-actions"><button className="user-mini" onClick={() => navigate('profile')}><span className="avatar small">{initials(currentUser.name)}</span>{currentUser.name}</button><button className="add-button" onClick={() => setModal('photo')}><span>＋</span> Add photo</button></div></header>{notice && <div className="toast" role="status">{notice}</div>}{activeTab === 'albums' && !selectedAlbum && <AlbumsHome albums={albums} currentUser={currentUser} loading={loading} onCreate={() => setModal('album')} onOpen={openAlbum} onToggleVisibility={toggleVisibility} />}{selectedAlbum && <AlbumDetail album={selectedAlbum} isOwner={selectedAlbum.user_id === currentUserId} onBack={() => setSelectedAlbum(null)} onAddPhoto={() => setModal('photo')} onToggleVisibility={() => toggleVisibility(selectedAlbum)} onDeletePhoto={deletePhoto} />}{activeTab === 'explore' && !selectedAlbum && <Explore albums={filteredExploreAlbums} search={search} locationSearch={locationSearch} onSearch={setSearch} onLocationSearch={setLocationSearch} onOpen={openAlbum} />}{activeTab === 'profile' && <Profile user={currentUser} albums={albums} onSave={saveProfile} />}<footer className="footer"><span>ZOOHUB <i>·</i> NATURE PHOTOGRAPHY</span><span>Share the world you see <b>✦</b></span></footer></main>
    {modal === 'album' && <AlbumModal onClose={() => setModal(null)} onSave={createAlbum} />}{modal === 'photo' && <PhotoModal albums={albums} selectedAlbum={selectedAlbum} onClose={() => setModal(null)} onSave={addPhoto} />}
  </div>
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User, token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const result = mode === 'login'
        ? await apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
        : await apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ id, name, email, password, bio }) })
      onAuthenticated(result.user, result.token)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The operation could not be completed.')
    } finally { setBusy(false) }
  }

  return <main className="auth-screen"><section className="auth-art"><div className="auth-logo"><span className="brand-mark">✦</span><span>Zoo<span className="brand-accent">Hub</span></span></div><div className="auth-quote"><p>THE WORLD<br />IS FULL OF<br />STORIES.</p><span>Find yours.</span></div><div className="auth-art-credit">SOCIAL NETWORK / NATURE PHOTOGRAPHY</div></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">YOUR VISUAL ARCHIVE <span>—</span> ZOOHUB</p><h1>{mode === 'login' ? 'Welcome back.' : 'Create your space.'}</h1><p className="auth-intro">{mode === 'login' ? 'Sign in to continue with your albums and photos.' : 'Create an account and start sharing your view.'}</p><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Create account</button></div><form className="auth-form" onSubmit={submit}>{mode === 'register' && <><label>User ID<input value={id} onChange={(event) => setId(event.target.value)} placeholder="your_id" autoComplete="username" required /></label><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required /></label><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" type="email" autoComplete="email" required /></label><label>Description <span className="optional">optional</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What do you photograph?" rows={3} /></label></>}{mode === 'login' && <label>ID or email<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="your_id or you@email.com" autoComplete="username" required /></label>}<label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>{error && <p className="form-error">{error}</p>}<button className="dark-button auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to ZooHub' : 'Create my account'}</button></form><p className="auth-switch">{mode === 'login' ? 'New to ZooHub?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create one' : 'Sign in'}</button></p></div></section></main>
}

function AlbumsHome({ albums, currentUser, loading, onCreate, onOpen, onToggleVisibility }: { albums: Album[]; currentUser: User; loading: boolean; onCreate: () => void; onOpen: (album: Album) => void; onToggleVisibility: (album: Album) => void }) {
  return <><section className="intro"><div><p className="eyebrow">YOUR SPACE <span>—</span> @{currentUser.id}</p><h1>My albums<span className="heading-dot">.</span></h1><p className="intro-copy">A place to gather your nature stories.<br />Share what you want and keep the rest for yourself.</p></div><div className="profile-summary"><span className="avatar large">{initials(currentUser.name)}</span><div><strong>{currentUser.name}</strong><small>{currentUser.bio || 'Add a description to your profile.'}</small></div></div></section><section className="stats-row"><div><strong>{albums.length}</strong><span>albums</span></div><div><strong>{albums.reduce((total, album) => total + (album.photo_count ?? 0), 0)}</strong><span>saved photos</span></div><div><strong>{albums.filter((album) => album.is_public).length}</strong><span>public</span></div></section><div className="section-heading"><div><h2>Your archive <span>·</span></h2><p>{loading ? 'Loading your collection…' : 'Organize photos by story and place'}</p></div><button className="create-link" onClick={onCreate}>＋ New album</button></div><section className="album-grid">{albums.map((album) => <AlbumCard key={album.id} album={album} own onOpen={onOpen} onToggleVisibility={onToggleVisibility} />)}<button className="new-album-card" onClick={onCreate}><span>＋</span><strong>Create an album</strong><small>By trip, species or project</small></button></section>{!albums.length && <div className="empty-state"><span>✦</span><h3>Your archive starts here</h3><p>Create an album and add the first photo of your next story.</p><button className="dark-button" onClick={onCreate}>Create my first album</button></div>}</>
}

function AlbumCard({ album, own = false, onOpen, onToggleVisibility }: { album: Album; own?: boolean; onOpen: (album: Album) => void; onToggleVisibility?: (album: Album) => void }) {
  return <article className="album-card" onClick={() => onOpen(album)}><button className="album-cover" onClick={(event) => { event.stopPropagation(); onOpen(album) }} aria-label={`Open ${album.title}`}><img src={album.cover_image || 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=85'} alt="" /><span className="album-count">{album.photo_count ?? 0} photos</span><span className={`visibility ${album.is_public ? 'public' : 'private'}`}>{album.is_public ? 'Public' : 'Private'}</span></button><div className="album-card-body"><div><h3>{album.title}</h3>{!own && <p className="author">by {album.author_name ?? album.user_id}</p>}<p className="album-locations">⌖ {(album.locations ?? []).join(' · ') || 'No locations'}</p></div>{own && onToggleVisibility && <button className="visibility-toggle" onClick={(event) => { event.stopPropagation(); onToggleVisibility(album) }}>{album.is_public ? 'Make private' : 'Publish'}</button>}</div></article>
}

function Explore({ albums, search, locationSearch, onSearch, onLocationSearch, onOpen }: { albums: Album[]; search: string; locationSearch: string; onSearch: (value: string) => void; onLocationSearch: (value: string) => void; onOpen: (album: Album) => void }) {
  return <><section className="intro compact"><div><p className="eyebrow">THE COMMUNITY <span>—</span> ZOOHUB</p><h1>Explore<span className="heading-dot">.</span></h1><p className="intro-copy">Discover stories from other photographers.<br />Search by name, project or place in the world.</p></div><div className="explore-mark">✦<small>shared<br />perspectives</small></div></section><div className="explore-toolbar"><label className="search large-search"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search album, photographer or ID…" /></label><label className="search location-search"><span>⌖</span><input value={locationSearch} onChange={(event) => onLocationSearch(event.target.value)} placeholder="Filter by country or location…" /></label></div><div className="section-heading"><div><h2>Public albums <span>·</span></h2><p>{albums.length} stories ready to explore</p></div></div><section className="album-grid explore-grid">{albums.map((album) => <AlbumCard key={album.id} album={album} onOpen={onOpen} />)}</section>{!albums.length && <div className="empty-state"><span>⌕</span><h3>No albums found</h3><p>Try another name or country.</p></div>}</>
}

function AlbumDetail({ album, isOwner, onBack, onAddPhoto, onToggleVisibility, onDeletePhoto }: { album: Album; isOwner: boolean; onBack: () => void; onAddPhoto: () => void; onToggleVisibility: () => void; onDeletePhoto: (album: Album, photo: Photo) => void }) {
  const photos = album.photos ?? []
  return <section className="album-detail"><button className="back-link" onClick={onBack}>← Back to albums</button><div className="detail-head"><div><div className="detail-kicker"><span className={`visibility-dot ${album.is_public ? 'public' : 'private'}`} /> {album.is_public ? 'PUBLIC ALBUM' : 'PRIVATE ALBUM'} {album.author_name && !isOwner && <span> · BY {album.author_name.toUpperCase()}</span>}</div><h1>{album.title}<span className="heading-dot">.</span></h1><p>{album.description || 'No description yet.'}</p><div className="detail-locations">⌖ {(album.locations ?? []).join('  ·  ') || 'No locations'}</div></div><div className="detail-actions">{isOwner && <><button className="outline-button" onClick={onToggleVisibility}>{album.is_public ? 'Make private' : 'Publish album'}</button><button className="dark-button" onClick={onAddPhoto}>＋ Add photo</button></>}</div></div><div className="photo-grid">{photos.map((photo, index) => <article className="photo-card" key={photo.id}><div className="image-wrap"><img src={photo.image} alt={photo.display_title || photo.title || `Photo ${index + 1}`} /></div><div className="card-body"><div><h3>{photo.display_title || photo.title || `Photo #${photo.order_index ?? index + 1}`}</h3><p><span className="location-pin">⌖</span>{photo.location}{photo.country ? ` · ${photo.country}` : ''}</p></div>{isOwner && <button className="delete-photo" onClick={() => onDeletePhoto(album, photo)} aria-label="Delete photo">Delete</button>}</div></article>)}</div>{!photos.length && <div className="empty-state small-empty"><span>✦</span><h3>This album is empty</h3>{isOwner && <button className="dark-button" onClick={onAddPhoto}>Add first photo</button>}</div>}</section>
}

function Profile({ user, albums, onSave }: { user: User; albums: Album[]; onSave: (user: User) => void }) {
  const [form, setForm] = useState(user)
  useEffect(() => setForm(user), [user])
  return <section className="profile-page"><div className="profile-hero"><span className="avatar huge">{initials(user.name)}</span><div><p className="eyebrow">YOUR ZOOHUB IDENTITY</p><h1>{user.name}<span className="heading-dot">.</span></h1><p className="handle">@{user.id}</p></div></div><div className="profile-layout"><form className="profile-form" onSubmit={(event) => { event.preventDefault(); onSave(form) }}><div className="form-heading"><div><h2>Edit profile</h2><p>Your ID is how other photographers find you.</p></div></div><label>User ID<input readOnly value={form.id} placeholder="your_id" /></label><label>Display name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" /></label><label>Description<textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="Tell the community what you photograph…" rows={4} /></label><button className="dark-button" type="submit">Save profile</button></form><aside className="community-card"><p className="eyebrow">YOUR ACTIVITY</p><div className="profile-stat"><strong>{albums.length}</strong><span>albums created</span></div><div className="profile-stat"><strong>{albums.reduce((sum, album) => sum + (album.photo_count ?? 0), 0)}</strong><span>photos in your archive</span></div><p className="profile-note">To use another account in this browser, open a new tab or sign out first.</p></aside></div></section>
}

function AlbumModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { title: string; description: string; locations: string[]; isPublic: boolean }) => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [locations, setLocations] = useState(''); const [isPublic, setIsPublic] = useState(true)
  return <Modal title="New album" onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const albumLocations = locations.split(',').map((item) => item.trim()).filter(Boolean); if (!title.trim() || !albumLocations.length) return; onSave({ title: title.trim(), description: description.trim(), locations: albumLocations, isPublic }) }}><p className="modal-intro">Create a space for a story, species or complete journey.</p><label>Album title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="E.g. Monkeys of the world" required /></label><label>Description <span className="optional">optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What connects these photographs?" rows={3} /></label><label>Countries or locations <span className="optional">comma separated</span><input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Japan, Indonesia, Mexico" required /></label><label className="switch-row"><span><strong>Visible to the community</strong><small>Private albums are only visible to you.</small></span><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /><span className="switch" /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="dark-button" type="submit">Create album</button></div></form></Modal>
}

function PhotoModal({ albums, selectedAlbum, onClose, onSave }: { albums: Album[]; selectedAlbum: Album | null; onClose: () => void; onSave: (album: Album, data: { title: string; location: string; country: string; image: string }) => void }) {
  const [albumId, setAlbumId] = useState(String(selectedAlbum?.id ?? albums[0]?.id ?? '')); const [title, setTitle] = useState(''); const [location, setLocation] = useState(''); const [country, setCountry] = useState(''); const [url, setUrl] = useState(''); const [file, setFile] = useState<File | null>(null); const [source, setSource] = useState<'file' | 'url'>('file'); const [error, setError] = useState('')
  const album = albums.find((item) => String(item.id) === albumId) ?? selectedAlbum ?? albums[0]
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!album || !location.trim()) { setError('Choose an album and enter the specific location.'); return } if (source === 'url' && !url.trim()) { setError('Paste the photo link.'); return } if (source === 'file' && !file) { setError('Select an image from your device.'); return }
    let image = url.trim(); if (source === 'file' && file) image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); onSave(album, { title: title.trim(), location: location.trim(), country: country.trim(), image })
  }
  return <Modal title="Add photo" onClose={onClose}><form className="modal-form" onSubmit={submit}><p className="modal-intro">Every photo needs a specific location. Titles are optional: untitled photos are numbered automatically.</p><label>Album<select value={albumId} onChange={(event) => setAlbumId(event.target.value)}>{albums.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{!albums.length && <p className="inline-warning">Create an album first to upload photos.</p>}<div className="source-tabs"><button type="button" className={source === 'file' ? 'active' : ''} onClick={() => setSource('file')}>From my device</button><button type="button" className={source === 'url' ? 'active' : ''} onClick={() => setSource('url')}>Paste a link</button></div>{source === 'file' ? <label className="file-drop"><input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="upload-symbol">↑</span><strong>{file ? file.name : 'Select an image'}</strong><small>JPG, PNG or WEBP</small></label> : <label>Image link<input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" type="url" /></label>}<div className="two-fields"><label>Title <span className="optional">optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Photo # if left empty" /></label><label>Country<input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Spain" /></label></div><label>Specific location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="E.g. Jigokudani Valley, Nagano" required /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="dark-button" type="submit" disabled={!album}>Add photo</button></div></form></Modal>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">ZOOHUB <span>—</span> ARCHIVE</p><h2>{title}</h2>{children}</section></div> }

export default App
