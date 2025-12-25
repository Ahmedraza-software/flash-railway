import os
import sqlite3


def inspect_db(db_path: str) -> None:
    print(f"--- {db_path}")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = [r[0] for r in cur.fetchall()]
    print(f"tables: {len(tables)}")

    for t in tables[:50]:
        try:
            cur.execute(f"SELECT COUNT(1) FROM {t}")
            c = cur.fetchone()[0]
        except Exception as e:
            c = f"ERR {e}"
        print(f"{t}: {c}")

    if len(tables) > 50:
        print("...")

    con.close()


def main() -> None:
    base = os.path.dirname(os.path.abspath(__file__))
    for name in ["flash_erp.db", "app.db", "erp.db"]:
        p = os.path.join(base, name)
        if os.path.exists(p):
            inspect_db(p)


if __name__ == "__main__":
    main()
