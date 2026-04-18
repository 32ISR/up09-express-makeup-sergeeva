const express = require('express');
const db = require('./db');
const jwt = require('jsonwebtoken');
const bcr = require('bcryptjs');

const app = express();
app.use(express.json());

const SECRET = process.env.SECRET || 'super-secret-movies-key';


const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Нет токена' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Неверный формат токена' });

    try {
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Токен недействителен' });
    }
};

const requireRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен (недостаточно прав)' });
    }
    next();
};


app.post('/api/auth/register', (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });

        const hash = bcr.hashSync(password, 10);
        const info = db.prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'user')").run(username, email, hash);
        
        return res.status(201).json({ message: 'Регистрация успешна', userId: info.lastInsertRowid });
    } catch (err) {
        return res.status(400).json({ error: 'Пользователь с таким email или username уже существует' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !bcr.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = jwt.sign(userWithoutPassword, SECRET, { expiresIn: '24h' });
    return res.json({ token, user: userWithoutPassword });
});

app.get('/api/auth/profile', auth, (req, res) => {
    const user = db.prepare('SELECT id, username, email, role, bio, createdAt FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

app.put('/api/auth/profile', auth, (req, res) => {
    const { username, bio } = req.body;
    db.prepare('UPDATE users SET username = ?, bio = ? WHERE id = ?').run(username, bio, req.user.id);
    res.json({ message: 'Профиль обновлен' });
});


app.get('/api/movies', (req, res) => {
    const { genre, director, year, sort = 'createdAt', order = 'DESC', page = 1, limit = 10 } = req.query;
    
    let query = `
        SELECT m.*, GROUP_CONCAT(g.name) as genres 
        FROM movies m
        LEFT JOIN movie_genres mg ON m.id = mg.movieId
        LEFT JOIN genres g ON mg.genreId = g.id
        WHERE 1=1
    `;
    const params = [];

    if (director) { query += ` AND m.director = ?`; params.push(director); }
    if (year) { query += ` AND m.year = ?`; params.push(year); }
    
    query += ` GROUP BY m.id`;
    if (genre) { query += ` HAVING genres LIKE ?`; params.push(`%${genre}%`); }

    const validSort = ['year', 'createdAt', 'title'].includes(sort) ? sort : 'createdAt';
    const validOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY m.${validSort} ${validOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const movies = db.prepare(query).all(...params);
    res.json(movies);
});

app.get('/api/movies/:id', (req, res) => {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Фильм не найден' });

    const genres = db.prepare(`SELECT g.name FROM genres g JOIN movie_genres mg ON g.id = mg.genreId WHERE mg.movieId = ?`).all(movie.id);
    const reviews = db.prepare(`SELECT * FROM reviews WHERE movieId = ? AND status = 'approved'`).all(movie.id);
    
    res.json({ ...movie, genres: genres.map(g => g.name), reviews });
});

app.post('/api/movies', auth, (req, res) => {
    const { title, director, year, country, description, posterUrl, genreIds } = req.body;
    
    const insertInfo = db.prepare(`INSERT INTO movies (title, director, year, country, description, posterUrl, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(title, director, year, country, description, posterUrl, req.user.id);
    
    if (genreIds && Array.isArray(genreIds)) {
        const stmt = db.prepare('INSERT INTO movie_genres (movieId, genreId) VALUES (?, ?)');
        genreIds.forEach(gId => stmt.run(insertInfo.lastInsertRowid, gId));
    }
    
    res.status(201).json({ id: insertInfo.lastInsertRowid, message: 'Фильм добавлен' });
});

app.put('/api/movies/:id', auth, (req, res) => {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Фильм не найден' });

    if (movie.createdBy !== req.user.id && req.user.role === 'user') {
        return res.status(403).json({ error: 'Нет прав на редактирование' });
    }

    const { title, description } = req.body; 
    db.prepare('UPDATE movies SET title = ?, description = ? WHERE id = ?').run(title || movie.title, description || movie.description, req.params.id);
    res.json({ message: 'Фильм обновлен' });
});

app.delete('/api/movies/:id', auth, requireRole(['admin', 'moderator']), (req, res) => {
    db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
    res.json({ message: 'Фильм удален' });
});


app.get('/api/genres', (req, res) => {
    res.json(db.prepare('SELECT * FROM genres').all());
});

app.post('/api/genres', auth, requireRole(['admin', 'moderator']), (req, res) => {
    try {
        const info = db.prepare('INSERT INTO genres (name) VALUES (?)').run(req.body.name);
        res.status(201).json({ id: info.lastInsertRowid, name: req.body.name });
    } catch (err) {
        res.status(400).json({ error: 'Жанр уже существует' });
    }
});

app.delete('/api/genres/:id', auth, requireRole(['admin']), (req, res) => {
    db.prepare('DELETE FROM genres WHERE id = ?').run(req.params.id);
    res.json({ message: 'Жанр удален' });
});


app.post('/api/movies/:id/reviews', auth, (req, res) => {
    const { rating, title, body } = req.body;
    const info = db.prepare('INSERT INTO reviews (movieId, userId, rating, title, body) VALUES (?, ?, ?, ?, ?)')
                   .run(req.params.id, req.user.id, rating, title, body);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Рецензия отправлена на модерацию' });
});

app.get('/api/movies/:id/reviews', (req, res) => {
    const reviews = db.prepare("SELECT * FROM reviews WHERE movieId = ? AND status = 'approved'").all(req.params.id);
    res.json(reviews);
});

app.delete('/api/reviews/:id', auth, (req, res) => {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Рецензия не найдена' });

    if (review.userId !== req.user.id && req.user.role === 'user') {
        return res.status(403).json({ error: 'Нет прав на удаление' });
    }

    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    res.json({ message: 'Рецензия удалена' });
});

app.patch('/api/reviews/:id/status', auth, requireRole(['admin', 'moderator']), (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: `Статус изменен на ${status}` });
});


app.post('/api/reviews/:id/like', auth, (req, res) => {
    try {
        db.prepare('INSERT INTO likes (reviewId, userId) VALUES (?, ?)').run(req.params.id, req.user.id);
        res.json({ message: 'Лайк поставлен' });
    } catch (err) {
        res.status(400).json({ error: 'Вы уже поставили лайк' });
    }
});

app.delete('/api/reviews/:id/like', auth, (req, res) => {
    db.prepare('DELETE FROM likes WHERE reviewId = ? AND userId = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Лайк удален' });
});


app.get('/api/admin/users', auth, requireRole(['admin']), (req, res) => {
    res.json(db.prepare('SELECT id, username, email, role, createdAt FROM users').all());
});

app.patch('/api/admin/users/:id/role', auth, requireRole(['admin']), (req, res) => {
    const { role } = req.body;
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    res.json({ message: `Роль изменена на ${role}` });
});

app.delete('/api/admin/users/:id', auth, requireRole(['admin']), (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'Пользователь удален' });
});

app.get('/api/admin/reviews/pending', auth, requireRole(['admin', 'moderator']), (req, res) => {
    res.json(db.prepare("SELECT * FROM reviews WHERE status = 'pending'").all());
});

app.listen(3000, () => {
    console.log('Сервер API запущен на http://localhost:3000');
});