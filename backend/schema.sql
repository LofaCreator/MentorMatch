-- MentorMatch database schema

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('student', 'mentor')),
    headline      TEXT    NOT NULL DEFAULT '',
    bio           TEXT    NOT NULL DEFAULT '',
    field         TEXT    NOT NULL DEFAULT '',   -- сфера: IT, дизайн, маркетинг...
    org           TEXT    NOT NULL DEFAULT '',   -- университет или компания
    skills        TEXT    NOT NULL DEFAULT '',   -- теги через запятую
    goal          TEXT    NOT NULL DEFAULT '',   -- чего хочет добиться
    location      TEXT    NOT NULL DEFAULT '',
    avatar_color  TEXT    NOT NULL DEFAULT '#E11D48',
    avatar        TEXT    NOT NULL DEFAULT '',       -- data URL загруженной аватарки
    experience    INTEGER NOT NULL DEFAULT 0,        -- лет опыта
    price         INTEGER NOT NULL DEFAULT 0,        -- ₽ за час (0 = бесплатно)
    verified      INTEGER NOT NULL DEFAULT 0,        -- галочка верификации
    subscribed    INTEGER NOT NULL DEFAULT 0,        -- PRO-подписка (продвижение)
    bonus_points  INTEGER NOT NULL DEFAULT 0,        -- бонусы за выполненные задания
    completed_tasks INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id  INTEGER NOT NULL REFERENCES users(id),  -- кому отзыв
    author_id  INTEGER NOT NULL REFERENCES users(id),  -- кто оставил
    rating     INTEGER NOT NULL DEFAULT 5,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    title      TEXT    NOT NULL,
    descr      TEXT    NOT NULL DEFAULT '',
    link       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches(id),
    mentor_id  INTEGER NOT NULL REFERENCES users(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    title      TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'open',   -- open | done
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS swipes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    swiper_id  INTEGER NOT NULL REFERENCES users(id),
    target_id  INTEGER NOT NULL REFERENCES users(id),
    direction  TEXT    NOT NULL CHECK (direction IN ('like', 'skip')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (swiper_id, target_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a     INTEGER NOT NULL REFERENCES users(id),
    user_b     INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches(id),
    sender_id  INTEGER NOT NULL REFERENCES users(id),
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
