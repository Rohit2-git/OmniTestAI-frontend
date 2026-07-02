import sqlite3
con = sqlite3.connect("dev.db")
print("--- TestDataProfile schema ---")
print(con.execute("SELECT sql FROM sqlite_master WHERE name='TestDataProfile'").fetchone())
print("--- All tables ---")
print([r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()])
