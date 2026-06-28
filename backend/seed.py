"""Demo data so the swipe deck isn't empty on first launch.

All demo accounts share the password: demo1234
"""
from werkzeug.security import generate_password_hash

COLORS = ["#E11D48", "#2563EB", "#7C3AED", "#059669", "#D97706", "#0891B2", "#DB2777", "#4F46E5"]

DEMO_USERS = [
    # mentors (выпускники)
    ("Анна Соколова", "anna@demo.io", "mentor", "Senior Frontend в Яндексе",
     "8 лет в вебе. Помогу с React, собеседованиями и переходом в продуктовую разработку.",
     "IT / Frontend", "Яндекс", "React, TypeScript, Карьера, Собеседования", "Растить джунов до мидлов",
     "Москва"),
    ("Дмитрий Орлов", "dmitry@demo.io", "mentor", "Data Scientist в Сбере",
     "Делаю ML в проде. Расскажу, как войти в Data Science без PhD и собрать сильное портфолио.",
     "IT / Data Science", "Сбер", "Python, ML, SQL, Pet-проекты", "Помочь со стартом в DS",
     "Москва"),
    ("Мария Власова", "maria@demo.io", "mentor", "Продуктовый дизайнер, ex-Avito",
     "Веду студентов от первого макета до оффера. Фигма, кейсы, ревью портфолио.",
     "Дизайн / UX", "Freelance", "Figma, UX, Портфолио, Кейсы", "Сделать сильное портфолио",
     "Санкт-Петербург"),
    ("Игорь Лебедев", "igor@demo.io", "mentor", "Backend-разработчик в Тинькофф",
     "Go, Python, системный дизайн. Помогу подготовиться к техническим интервью в бигтех.",
     "IT / Backend", "Тинькофф", "Go, Python, System Design, Алгоритмы", "Подготовить к собеседованиям",
     "Москва"),
    ("Екатерина Зайцева", "kate@demo.io", "mentor", "Маркетолог, руковожу ростом",
     "Перформанс и продуктовый маркетинг. Покажу, как строить карьеру в маркетинге с нуля.",
     "Маркетинг", "Ozon", "SMM, Аналитика, Стратегия, Карьера", "Менторить будущих маркетологов",
     "Москва"),

    # students (студенты)
    ("Павел Морозов", "pavel@demo.io", "student", "Студент 3 курса, ВМК МГУ",
     "Учу алгоритмы и Python, хочу попасть на стажировку backend-разработчиком.",
     "IT / Backend", "МГУ", "Python, C++, Алгоритмы", "Найти первую стажировку",
     "Москва"),
    ("Алиса Кузнецова", "alisa@demo.io", "student", "Учусь на дизайнера, ВШЭ",
     "Собираю портфолио по UX, ищу ментора для ревью кейсов и фидбэка.",
     "Дизайн / UX", "ВШЭ", "Figma, UI, Учёба", "Получить первый оффер дизайнером",
     "Санкт-Петербург"),
    ("Никита Волков", "nikita@demo.io", "student", "Будущий аналитик данных",
     "Прохожу курсы по ML, хочу понять, как выстроить путь в Data Science.",
     "IT / Data Science", "СПбГУ", "Python, SQL, Статистика", "Разобраться с карьерным треком",
     "Санкт-Петербург"),
]


def seed_demo(conn):
    # pbkdf2 — кроссплатформенно (scrypt по умолчанию падает на части систем, напр. LibreSSL)
    pw = generate_password_hash("demo1234", method="pbkdf2:sha256")
    for i, u in enumerate(DEMO_USERS):
        name, email, role, headline, bio, field, org, skills, goal, location = u
        conn.execute(
            """INSERT INTO users
               (name, email, password_hash, role, headline, bio, field, org, skills, goal, location, avatar_color)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (name, email, pw, role, headline, bio, field, org, skills, goal, location, COLORS[i % len(COLORS)]),
        )
    conn.commit()


# опыт (лет), цена (₽/час), верификация по email ментора
MENTOR_META = {
    "anna@demo.io":   (8, 2500, 1),
    "dmitry@demo.io": (6, 3000, 1),
    "maria@demo.io":  (7, 2000, 1),
    "igor@demo.io":   (9, 3500, 1),
    "kate@demo.io":   (5, 1800, 0),
}

# отзывы: email ментора -> [(автор-email, рейтинг, текст)]
REVIEWS = {
    "anna@demo.io": [
        ("pavel@demo.io", 5, "Помогла собрать резюме и подготовиться к собеседованию — получил оффер на стажировку!"),
        ("nikita@demo.io", 5, "Очень структурно объясняет React. После пары созвонов всё встало на места."),
        ("alisa@demo.io", 4, "Полезно и по делу, дала чёткий план развития на полгода."),
    ],
    "maria@demo.io": [
        ("alisa@demo.io", 5, "Разобрала моё портфолио по полочкам, теперь не стыдно показывать работодателю."),
        ("pavel@demo.io", 5, "Крутые кейсы и ревью макетов, видно огромный опыт."),
    ],
    "dmitry@demo.io": [
        ("nikita@demo.io", 5, "Объяснил, как войти в Data Science без PhD. Дал реальный roadmap и пет-проекты."),
        ("pavel@demo.io", 4, "Помог с SQL и статистикой, отвечает быстро."),
    ],
    "igor@demo.io": [
        ("pavel@demo.io", 5, "Натаскал по алгоритмам и системному дизайну — прошёл в бигтех."),
    ],
}

# портфолио: email -> [(title, descr, link)]
PORTFOLIO = {
    "maria@demo.io": [
        ("Редизайн маркетплейса", "UX-исследование и новый флоу оформления заказа, +18% к конверсии.", "https://dribbble.com"),
        ("Дизайн-система для финтеха", "120+ компонентов, токены, тёмная тема.", "https://figma.com"),
    ],
    "anna@demo.io": [
        ("Платёжный виджет на React", "Переиспользуемый компонент, 1M+ показов в день.", "https://github.com"),
    ],
    "dmitry@demo.io": [
        ("Модель оттока клиентов", "ML-пайплайн на проде, ROC-AUC 0.89.", "https://github.com"),
    ],
}


def _id(conn, email):
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    return row["id"] if row else None


def enrich_demo(conn):
    """Опыт/цена/верификация + демо-отзывы и портфолио. Идемпотентно по reviews."""
    for email, (exp, price, ver) in MENTOR_META.items():
        conn.execute(
            "UPDATE users SET experience = ?, price = ?, verified = ? WHERE email = ?",
            (exp, price, ver, email),
        )
    for mentor_email, items in REVIEWS.items():
        mid = _id(conn, mentor_email)
        if not mid:
            continue
        for author_email, rating, body in items:
            aid = _id(conn, author_email)
            if aid:
                conn.execute(
                    "INSERT INTO reviews (mentor_id, author_id, rating, body) VALUES (?,?,?,?)",
                    (mid, aid, rating, body),
                )
    for email, items in PORTFOLIO.items():
        uid = _id(conn, email)
        if not uid:
            continue
        for title, descr, link in items:
            conn.execute(
                "INSERT INTO portfolio (user_id, title, descr, link) VALUES (?,?,?,?)",
                (uid, title, descr, link),
            )
    conn.commit()
