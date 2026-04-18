const Database = require('better-sqlite3');
const bcr = require('bcryptjs');

const db = new Database('movies.db');

db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        bio TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        director TEXT NOT NULL,
        year INTEGER NOT NULL,
        country TEXT NOT NULL,
        description TEXT NOT NULL,
        posterUrl TEXT,
        createdBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movie_genres (
        movieId INTEGER,
        genreId INTEGER,
        PRIMARY KEY (movieId, genreId),
        FOREIGN KEY (movieId) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (genreId) REFERENCES genres(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movieId INTEGER,
        userId INTEGER,
        rating INTEGER CHECK(rating >= 1 AND rating <= 10),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (movieId) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reviewId INTEGER,
        userId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reviewId, userId),
        FOREIGN KEY (reviewId) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
`);

const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

if (usersCount === 0) {
    console.log('БД пуста. Начинаю создание тестовых данных...');
    
    const salt = bcr.genSaltSync(10);
    const hash = bcr.hashSync('qwerty123', salt);

    const insertUser = db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)');
    const adminId = insertUser.run('admin', 'admin@mail.com', hash, 'admin').lastInsertRowid;
    const modId = insertUser.run('moderator', 'mod@mail.com', hash, 'moderator').lastInsertRowid;
    const userId = insertUser.run('user', 'user@mail.com', hash, 'user').lastInsertRowid;

    const insertGenre = db.prepare('INSERT INTO genres (name) VALUES (?)');
    const actionId = insertGenre.run('Action').lastInsertRowid;
    const sciFiId = insertGenre.run('Sci-Fi').lastInsertRowid;
    const dramaId = insertGenre.run('Drama').lastInsertRowid;

    const insertMovie = db.prepare('INSERT INTO movies (title, director, year, country, description, createdBy) VALUES (?, ?, ?, ?, ?, ?)');
    const m1 = insertMovie.run('Inception', 'Nolan', 2010, 'USA', 'Dream stealing.', adminId).lastInsertRowid;
    const m2 = insertMovie.run('Interstellar', 'Nolan', 2014, 'USA', 'Space travel.', adminId).lastInsertRowid;
    const m3 = insertMovie.run('Matrix', 'Wachowski', 1999, 'USA', 'Simulation.', modId).lastInsertRowid;
    const m4 = insertMovie.run('Dune', 'Villeneuve', 2021, 'USA', 'Spice on Arrakis.', modId).lastInsertRowid;
    const m5 = insertMovie.run('Tenet', 'Nolan', 2020, 'USA', 'Time inversion.', adminId).lastInsertRowid;

    const insertMG = db.prepare('INSERT INTO movie_genres (movieId, genreId) VALUES (?, ?)');
    insertMG.run(m1, sciFiId); insertMG.run(m1, actionId);
    insertMG.run(m2, sciFiId); insertMG.run(m2, dramaId);
    insertMG.run(m3, actionId); insertMG.run(m3, sciFiId);
    insertMG.run(m4, sciFiId); insertMG.run(m4, dramaId);
    insertMG.run(m5, actionId);

    const insertReview = db.prepare('INSERT INTO reviews (movieId, userId, rating, title, body, status) VALUES (?, ?, ?, ?, ?, ?)');
    const r1 = insertReview.run(m1, userId, 9, 'Great!', 'Loved the visuals.', 'approved').lastInsertRowid;
    const r2 = insertReview.run(m2, modId, 10, 'Masterpiece', 'Hans Zimmer is a genius.', 'approved').lastInsertRowid;
    const r3 = insertReview.run(m3, userId, 8, 'Classic', 'Still holds up.', 'approved').lastInsertRowid;
    const r4 = insertReview.run(m4, userId, 7, 'Good', 'A bit long.', 'pending').lastInsertRowid;
    const r5 = insertReview.run(m5, userId, 6, 'Confusing', 'Too complex.', 'pending').lastInsertRowid;

    const insertLike = db.prepare('INSERT INTO likes (reviewId, userId) VALUES (?, ?)');
    insertLike.run(r1, adminId);
    insertLike.run(r1, modId);
    insertLike.run(r2, adminId);
    insertLike.run(r3, adminId);
    insertLike.run(r4, modId);

    console.log('Тестовые данные успешно добавлены!');
}

module.exports = db;