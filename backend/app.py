"""MentorMatch — платформа менторства со свайп-механикой (как Tinder).

Backend: Flask + SQLite. Раздаёт фронтенд (../frontend) и REST API под /api.
Запуск:  python app.py  →  http://localhost:5000
"""
import os
import random

from flask import Flask, g, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db, init_db

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
AVATAR_COLORS = ["#E11D48", "#2563EB", "#7C3AED", "#059669", "#D97706", "#0891B2", "#DB2777", "#4F46E5"]

DEBUG = os.environ.get("FLASK_DEBUG") == "1"  # debug включается ЯВНО; по умолчанию выключен (без Werkzeug-дебаггера в проде)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
# нет заданного секрета → случайный (сессии собьются при рестарте, но ключ не угадать).
# Для постоянных сессий задай MENTORMATCH_SECRET в окружении.
app.secret_key = os.environ.get("MENTORMATCH_SECRET") or os.urandom(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,                       # JS не достанет cookie сессии (XSS-митигейшн)
    SESSION_COOKIE_SAMESITE="Lax",                      # cross-site POST не шлёт cookie (CSRF-митигейшн)
    SESSION_COOKIE_SECURE=bool(os.environ.get("MENTORMATCH_SECURE")),  # за HTTPS выставь MENTORMATCH_SECURE=1
)


@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")  # без кликджекинга
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp


# ---------- db lifecycle ----------
@app.before_request
def _open_db():
    g.db = get_db()


@app.teardown_request
def _close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def public_user(row):
    """User row -> JSON-safe dict без пароля."""
    d = dict(row)
    d.pop("password_hash", None)
    d["skills"] = [s.strip() for s in (d.get("skills") or "").split(",") if s.strip()]
    return d


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    return g.db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def login_required():
    u = current_user()
    if u is None:
        return None, (jsonify({"error": "Не авторизован"}), 401)
    return u, None


# ---------- auth ----------
@app.post("/api/register")
def register():
    data = request.get_json(force=True) or {}
    required = ["name", "email", "password", "role"]
    for key in required:
        if not str(data.get(key, "")).strip():
            return jsonify({"error": f"Поле '{key}' обязательно"}), 400
    if data["role"] not in ("student", "mentor"):
        return jsonify({"error": "role должен быть student или mentor"}), 400
    if len(data["password"]) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400

    email = data["email"].strip().lower()
    exists = g.db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
    if exists:
        return jsonify({"error": "Пользователь с таким email уже есть"}), 409

    cur = g.db.execute(
        """INSERT INTO users
           (name, email, password_hash, role, headline, bio, field, org, skills, goal, location, avatar_color)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            data["name"].strip(),
            email,
            generate_password_hash(data["password"], method="pbkdf2:sha256"),
            data["role"],
            data.get("headline", "").strip(),
            data.get("bio", "").strip(),
            data.get("field", "").strip(),
            data.get("org", "").strip(),
            data.get("skills", "").strip(),
            data.get("goal", "").strip(),
            data.get("location", "").strip(),
            random.choice(AVATAR_COLORS),
        ),
    )
    g.db.commit()
    session["uid"] = cur.lastrowid
    row = g.db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(public_user(row)), 201


@app.post("/api/login")
def login():
    data = request.get_json(force=True) or {}
    email = str(data.get("email", "")).strip().lower()
    row = g.db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], data.get("password", "")):
        return jsonify({"error": "Неверный email или пароль"}), 401
    session["uid"] = row["id"]
    return jsonify(public_user(row))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    u = current_user()
    if u is None:
        return jsonify({"user": None})
    return jsonify({"user": public_user(u)})


@app.put("/api/me")
def update_me():
    u, err = login_required()
    if err:
        return err
    data = request.get_json(force=True) or {}
    fields = ["name", "headline", "bio", "field", "org", "skills", "goal", "location", "avatar"]
    updates = {f: data[f].strip() for f in fields if f in data and isinstance(data[f], str)}
    # числовые поля
    for f in ("experience", "price"):
        if f in data:
            try:
                updates[f] = max(0, int(data[f]))
            except (TypeError, ValueError):
                pass
    if updates:
        cols = ", ".join(f"{k} = ?" for k in updates)
        g.db.execute(f"UPDATE users SET {cols} WHERE id = ?", (*updates.values(), u["id"]))
        g.db.commit()
    row = g.db.execute("SELECT * FROM users WHERE id = ?", (u["id"],)).fetchone()
    return jsonify(public_user(row))


def _profile_payload(uid):
    user = g.db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not user:
        return None
    data = public_user(user)
    revs = g.db.execute(
        """SELECT r.rating, r.body, r.created_at, u.name AS author_name,
                  u.avatar AS author_avatar, u.role AS author_role
           FROM reviews r JOIN users u ON u.id = r.author_id
           WHERE r.mentor_id = ? ORDER BY r.id DESC""",
        (uid,),
    ).fetchall()
    data["reviews"] = [dict(r) for r in revs]
    data["rating"] = round(sum(r["rating"] for r in revs) / len(revs), 1) if revs else 0
    port = g.db.execute(
        "SELECT id, title, descr, link, created_at FROM portfolio WHERE user_id = ? ORDER BY id DESC",
        (uid,),
    ).fetchall()
    data["portfolio"] = [dict(p) for p in port]
    return data


@app.get("/api/users/<int:uid>")
def get_user(uid):
    _, err = login_required()
    if err:
        return err
    data = _profile_payload(uid)
    if data is None:
        return jsonify({"error": "Пользователь не найден"}), 404
    return jsonify(data)


@app.post("/api/users/<int:uid>/reviews")
def add_review(uid):
    u, err = login_required()
    if err:
        return err
    if uid == u["id"]:
        return jsonify({"error": "Нельзя оставить отзыв самому себе"}), 400
    if not g.db.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({"error": "Пользователь не найден"}), 404
    data = request.get_json(force=True) or {}
    body = str(data.get("body", "")).strip()
    if not body:
        return jsonify({"error": "Текст отзыва пуст"}), 400
    rating = data.get("rating", 5)
    try:
        rating = min(5, max(1, int(rating)))
    except (TypeError, ValueError):
        rating = 5
    g.db.execute(
        "INSERT INTO reviews (mentor_id, author_id, rating, body) VALUES (?,?,?,?)",
        (uid, u["id"], rating, body),
    )
    g.db.commit()
    return jsonify(_profile_payload(uid)), 201


FREE_PORTFOLIO_LIMIT = 3


@app.post("/api/portfolio")
def add_portfolio():
    u, err = login_required()
    if err:
        return err
    data = request.get_json(force=True) or {}
    title = str(data.get("title", "")).strip()
    if not title:
        return jsonify({"error": "Нужно название проекта"}), 400
    if not u["subscribed"]:
        count = g.db.execute("SELECT COUNT(*) AS c FROM portfolio WHERE user_id = ?", (u["id"],)).fetchone()["c"]
        if count >= FREE_PORTFOLIO_LIMIT:
            return jsonify({"error": f"На бесплатном плане до {FREE_PORTFOLIO_LIMIT} проектов. Оформи PRO для безлимита.", "upsell": True}), 402
    g.db.execute(
        "INSERT INTO portfolio (user_id, title, descr, link) VALUES (?,?,?,?)",
        (u["id"], title, str(data.get("descr", "")).strip(), str(data.get("link", "")).strip()),
    )
    g.db.commit()
    return jsonify(_profile_payload(u["id"])), 201


@app.delete("/api/portfolio/<int:pid>")
def del_portfolio(pid):
    u, err = login_required()
    if err:
        return err
    g.db.execute("DELETE FROM portfolio WHERE id = ? AND user_id = ?", (pid, u["id"]))
    g.db.commit()
    return jsonify(_profile_payload(u["id"]))


# ---------- подписка (PRO) ----------
@app.post("/api/subscribe")
def subscribe():
    u, err = login_required()
    if err:
        return err
    on = bool((request.get_json(force=True) or {}).get("on", True))
    g.db.execute("UPDATE users SET subscribed = ? WHERE id = ?", (1 if on else 0, u["id"]))
    g.db.commit()
    row = g.db.execute("SELECT * FROM users WHERE id = ?", (u["id"],)).fetchone()
    return jsonify(public_user(row))


# ---------- топ менторов месяца ----------
@app.get("/api/top")
def top_mentors():
    _, err = login_required()
    if err:
        return err
    rows = g.db.execute(
        """SELECT u.*,
                  (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE mentor_id = u.id) AS rating,
                  (SELECT COUNT(*) FROM reviews WHERE mentor_id = u.id) AS reviews_count,
                  (SELECT COALESCE(AVG(rating), 0) * 2 FROM reviews WHERE mentor_id = u.id)
                    + (SELECT COUNT(*) FROM reviews WHERE mentor_id = u.id)
                    + u.completed_tasks + u.subscribed AS score
           FROM users u
           WHERE u.role = 'mentor'
           ORDER BY score DESC, u.verified DESC
           LIMIT 10"""
    ).fetchall()
    return jsonify([public_user(r) for r in rows])


# ---------- задания и бонусы ----------
@app.get("/api/tasks/<int:match_id>")
def list_tasks(match_id):
    u, err = login_required()
    if err:
        return err
    m = g.db.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if not m or u["id"] not in (m["user_a"], m["user_b"]):
        return jsonify({"error": "Нет доступа"}), 403
    rows = g.db.execute("SELECT * FROM tasks WHERE match_id = ? ORDER BY id DESC", (match_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/tasks/<int:match_id>")
def add_task(match_id):
    u, err = login_required()
    if err:
        return err
    if u["role"] != "mentor":
        return jsonify({"error": "Задания выдаёт ментор"}), 403
    m = g.db.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if not m or u["id"] not in (m["user_a"], m["user_b"]):
        return jsonify({"error": "Нет доступа"}), 403
    title = str((request.get_json(force=True) or {}).get("title", "")).strip()
    if not title:
        return jsonify({"error": "Опиши задание"}), 400
    student_id = m["user_a"] if m["user_b"] == u["id"] else m["user_b"]
    g.db.execute(
        "INSERT INTO tasks (match_id, mentor_id, student_id, title) VALUES (?,?,?,?)",
        (match_id, u["id"], student_id, title),
    )
    g.db.commit()
    rows = g.db.execute("SELECT * FROM tasks WHERE match_id = ? ORDER BY id DESC", (match_id,)).fetchall()
    return jsonify([dict(r) for r in rows]), 201


BONUS_PER_TASK = 10


@app.post("/api/tasks/<int:task_id>/done")
def complete_task(task_id):
    u, err = login_required()
    if err:
        return err
    t = g.db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not t:
        return jsonify({"error": "Задание не найдено"}), 404
    if t["student_id"] != u["id"]:
        return jsonify({"error": "Отметить выполнение может только студент"}), 403
    if t["status"] != "done":
        g.db.execute("UPDATE tasks SET status = 'done' WHERE id = ?", (task_id,))
        g.db.execute(
            "UPDATE users SET bonus_points = bonus_points + ?, completed_tasks = completed_tasks + 1 WHERE id = ?",
            (BONUS_PER_TASK, u["id"]),
        )
        g.db.commit()
    me = g.db.execute("SELECT * FROM users WHERE id = ?", (u["id"],)).fetchone()
    rows = g.db.execute("SELECT * FROM tasks WHERE match_id = ? ORDER BY id DESC", (t["match_id"],)).fetchall()
    return jsonify({"tasks": [dict(r) for r in rows], "me": public_user(me), "earned": BONUS_PER_TASK})


# ---------- swipe deck ----------
@app.get("/api/deck")
def deck():
    u, err = login_required()
    if err:
        return err
    # показываем противоположную роль, кого ещё не свайпали
    opposite = "mentor" if u["role"] == "student" else "student"
    rows = g.db.execute(
        """SELECT * FROM users
           WHERE role = ?
             AND id != ?
             AND id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
           ORDER BY subscribed DESC, RANDOM()
           LIMIT 30""",
        (opposite, u["id"], u["id"]),
    ).fetchall()
    return jsonify([public_user(r) for r in rows])


@app.get("/api/candidates")
def candidates():
    """Полный список людей противоположной роли — для режима «Список» с фильтром по тегам."""
    u, err = login_required()
    if err:
        return err
    opposite = "mentor" if u["role"] == "student" else "student"
    rows = g.db.execute(
        """SELECT u.*,
                  (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE mentor_id = u.id) AS rating,
                  (SELECT COUNT(*) FROM reviews WHERE mentor_id = u.id) AS reviews_count
           FROM users u
           WHERE u.role = ? AND u.id != ?
           ORDER BY u.subscribed DESC, u.verified DESC, u.id DESC""",
        (opposite, u["id"]),
    ).fetchall()
    return jsonify([public_user(r) for r in rows])


@app.post("/api/swipe")
def swipe():
    u, err = login_required()
    if err:
        return err
    data = request.get_json(force=True) or {}
    target_id = data.get("target_id")
    direction = data.get("direction")
    if direction not in ("like", "skip") or not target_id:
        return jsonify({"error": "Нужны target_id и direction (like|skip)"}), 400
    if target_id == u["id"]:
        return jsonify({"error": "Нельзя свайпать себя"}), 400

    g.db.execute(
        "INSERT OR IGNORE INTO swipes (swiper_id, target_id, direction) VALUES (?,?,?)",
        (u["id"], target_id, direction),
    )
    g.db.commit()

    matched = False
    match_user = None
    if direction == "like":
        back = g.db.execute(
            "SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND direction = 'like'",
            (target_id, u["id"]),
        ).fetchone()
        if back:
            a, b = sorted((u["id"], int(target_id)))
            g.db.execute("INSERT OR IGNORE INTO matches (user_a, user_b) VALUES (?,?)", (a, b))
            g.db.commit()
            matched = True
            row = g.db.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
            match_user = public_user(row)
    return jsonify({"match": matched, "user": match_user})


# ---------- matches & chat ----------
def _match_for(user_id, other_id):
    a, b = sorted((int(user_id), int(other_id)))
    return g.db.execute("SELECT * FROM matches WHERE user_a = ? AND user_b = ?", (a, b)).fetchone()


@app.get("/api/matches")
def matches():
    u, err = login_required()
    if err:
        return err
    rows = g.db.execute(
        """SELECT m.id AS match_id, m.created_at,
                  CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END AS other_id
           FROM matches m
           WHERE m.user_a = ? OR m.user_b = ?
           ORDER BY m.created_at DESC""",
        (u["id"], u["id"], u["id"]),
    ).fetchall()
    result = []
    for r in rows:
        other = g.db.execute("SELECT * FROM users WHERE id = ?", (r["other_id"],)).fetchone()
        last = g.db.execute(
            "SELECT body, created_at FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1",
            (r["match_id"],),
        ).fetchone()
        result.append({
            "match_id": r["match_id"],
            "user": public_user(other),
            "last_message": last["body"] if last else None,
        })
    return jsonify(result)


@app.get("/api/messages/<int:match_id>")
def get_messages(match_id):
    u, err = login_required()
    if err:
        return err
    m = g.db.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if not m or u["id"] not in (m["user_a"], m["user_b"]):
        return jsonify({"error": "Нет доступа"}), 403
    rows = g.db.execute(
        "SELECT id, sender_id, body, created_at FROM messages WHERE match_id = ? ORDER BY id",
        (match_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/messages/<int:match_id>")
def send_message(match_id):
    u, err = login_required()
    if err:
        return err
    m = g.db.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if not m or u["id"] not in (m["user_a"], m["user_b"]):
        return jsonify({"error": "Нет доступа"}), 403
    body = str((request.get_json(force=True) or {}).get("body", "")).strip()
    if not body:
        return jsonify({"error": "Пустое сообщение"}), 400
    cur = g.db.execute(
        "INSERT INTO messages (match_id, sender_id, body) VALUES (?,?,?)",
        (match_id, u["id"], body),
    )
    g.db.commit()
    row = g.db.execute("SELECT id, sender_id, body, created_at FROM messages WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


# ---------- frontend ----------
@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=DEBUG)
