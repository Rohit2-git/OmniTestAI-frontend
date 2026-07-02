import sqlite3
con = sqlite3.connect("dev.db")
print(con.execute("SELECT sql FROM sqlite_master WHERE name='TestRun'").fetchone())
