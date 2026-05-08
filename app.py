import string
import random
import sqlite3
from flask import Flask, g, request, jsonify
from functools import wraps

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


def get_db():
    db = getattr(g, "_database", None)

    if db is None:
        db = g._database = sqlite3.connect("db/watchparty.sqlite3")
        db.row_factory = sqlite3.Row
        setattr(g, "_database", db)

    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, "_database", None)

    if db is not None:
        db.close()


def query_db(query, args=(), one=False):
    db = get_db()
    cursor = db.execute(query, args)
    rows = cursor.fetchall()
    db.commit()
    cursor.close()

    if rows:
        if one:
            return rows[0]
        return rows

    return None


def new_user():
    name = "Unnamed User #" + "".join(random.choices(string.digits, k=6))
    password = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    api_key = "".join(random.choices(string.ascii_lowercase + string.digits, k=40))

    user = query_db(
        """
        insert into users (name, password, api_key)
        values (?, ?, ?)
        returning id, name, password, api_key
        """,
        (name, password, api_key),
        one=True,
    )

    return user


@app.route("/")
@app.route("/profile")
@app.route("/login")
@app.route("/room")
@app.route("/room/<chat_id>")
def index(chat_id=None):
    return app.send_static_file("index.html")


@app.errorhandler(404)
def page_not_found(e):
    return app.send_static_file("404.html"), 404


# -------------------------------- API HELPERS ----------------------------------


def row_to_dict(row):
    return dict(row) if row else None


def get_user():
    api_key = request.headers.get("X-API-Key")

    if not api_key:
        return None

    return query_db(
        "select id, name, password, api_key from users where api_key = ?",
        (api_key,),
        one=True,
    )


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_user()

        if not user:
            return jsonify({"error": "Unauthorized"}), 401

        return f(user, *args, **kwargs)

    return wrapper


# -------------------------------- API ROUTES ----------------------------------


@app.route("/api/signup", methods=["POST"])
def signup():
    user = new_user()

    return jsonify(
        {
            "id": user["id"],
            "name": user["name"],
            "password": user["password"],
            "api_key": user["api_key"],
        }
    )


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}

    username = data.get("username")
    password = data.get("password")

    user = query_db(
        "select id, name, api_key from users where name = ? and password = ?",
        (username, password),
        one=True,
    )

    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    return jsonify(
        {
            "id": user["id"],
            "name": user["name"],
            "api_key": user["api_key"],
        }
    )


@app.route("/api/me", methods=["GET"])
@login_required
def me(user):
    return jsonify(
        {
            "id": user["id"],
            "name": user["name"],
            "api_key": user["api_key"],
        }
    )


@app.route("/api/me/name", methods=["POST"])
@login_required
def update_name(user):
    data = request.get_json() or {}
    name = data.get("name", "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400

    updated = query_db(
        """
        update users
        set name = ?
        where id = ?
        returning id, name, api_key
        """,
        (name, user["id"]),
        one=True,
    )

    return jsonify(
        {
            "id": updated["id"],
            "name": updated["name"],
            "api_key": updated["api_key"],
        }
    )


@app.route("/api/me/password", methods=["POST"])
@login_required
def update_password(user):
    data = request.get_json() or {}
    password = data.get("password", "")

    if len(password) < 5:
        return jsonify({"error": "Password must be at least 5 characters"}), 400

    updated = query_db(
        """
        update users
        set password = ?
        where id = ?
        returning id, name
        """,
        (password, user["id"]),
        one=True,
    )

    return jsonify(
        {
            "id": updated["id"],
            "name": updated["name"],
        }
    )


@app.route("/api/rooms", methods=["GET"])
@login_required
def get_rooms(user):
    rooms = query_db("select id, name from rooms order by id asc")

    if not rooms:
        return jsonify([])

    return jsonify(
        [
            {
                "id": room["id"],
                "name": room["name"],
            }
            for room in rooms
        ]
    )


@app.route("/api/rooms", methods=["POST"])
@login_required
def create_room(user):
    data = request.get_json() or {}
    name = data.get("name", "New Room").strip()

    if not name:
        name = "New Room"

    room = query_db(
        """
        insert into rooms (name)
        values (?)
        returning id, name
        """,
        (name,),
        one=True,
    )

    return jsonify(
        {
            "id": room["id"],
            "name": room["name"],
        }
    )


@app.route("/api/rooms/<room_id>", methods=["GET"])
@login_required
def get_room(user, room_id):
    room = query_db(
        "select id, name from rooms where id = ?",
        (room_id,),
        one=True,
    )

    if not room:
        return jsonify({"error": "Room not found"}), 404

    return jsonify(
        {
            "id": room["id"],
            "name": room["name"],
        }
    )


@app.route("/api/rooms/<room_id>", methods=["POST"])
@login_required
def update_room(user, room_id):
    data = request.get_json() or {}
    name = data.get("name", "").strip()

    if not name:
        return jsonify({"error": "Room name is required"}), 400

    room = query_db(
        """
        update rooms
        set name = ?
        where id = ?
        returning id, name
        """,
        (name, room_id),
        one=True,
    )

    if not room:
        return jsonify({"error": "Room not found"}), 404

    return jsonify(
        {
            "id": room["id"],
            "name": room["name"],
        }
    )


@app.route("/api/messages/room/<room_id>", methods=["GET"])
@login_required
def get_messages(user, room_id):
    room = query_db(
        "select id from rooms where id = ?",
        (room_id,),
        one=True,
    )

    if not room:
        return jsonify({"error": "Room not found"}), 404

    messages = query_db(
        """
        select messages.id, messages.body, users.name as username
        from messages
        join users on users.id = messages.user_id
        where messages.room_id = ?
        order by messages.id asc
        """,
        (room_id,),
    )

    if not messages:
        return jsonify([])

    return jsonify(
        [
            {
                "id": message["id"],
                "body": message["body"],
                "username": message["username"],
            }
            for message in messages
        ]
    )


@app.route("/api/messages", methods=["POST"])
@login_required
def create_message(user):
    data = request.get_json() or {}

    room_id = data.get("room_id")
    body = data.get("body", "").strip()

    if not room_id or not body:
        return jsonify({"error": "room_id and body are required"}), 400

    room = query_db(
        "select id from rooms where id = ?",
        (room_id,),
        one=True,
    )

    if not room:
        return jsonify({"error": "Room not found"}), 404

    message = query_db(
        """
        insert into messages (user_id, room_id, body)
        values (?, ?, ?)
        returning id, body
        """,
        (user["id"], room_id, body),
        one=True,
    )

    return jsonify(
        {
            "id": message["id"],
            "body": message["body"],
            "username": user["name"],
        }
    )