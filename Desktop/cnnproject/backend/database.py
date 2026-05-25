import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lunar_craters.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the SQLite database and creates the craters table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create craters table matching the suggested schema
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS craters (
            crater_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            diameter_km REAL NOT NULL,
            depth_m REAL NOT NULL,
            avg_slope_deg REAL NOT NULL,
            shadow_fraction REAL NOT NULL,
            psr_status TEXT NOT NULL,
            celestial_body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully at:", DATABASE_PATH)

def insert_or_replace_crater(crater_data):
    """
    Inserts a crater record or replaces it if it already exists.
    crater_data: dict with keys matching table columns
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO craters (
            crater_id, name, latitude, longitude, diameter_km, 
            depth_m, avg_slope_deg, shadow_fraction, psr_status, celestial_body
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        crater_data['crater_id'],
        crater_data['name'],
        crater_data['latitude'],
        crater_data['longitude'],
        crater_data['diameter_km'],
        crater_data['depth_m'],
        crater_data['avg_slope_deg'],
        crater_data['shadow_fraction'],
        crater_data['psr_status'],
        crater_data.get('celestial_body', 'Moon')
    ))
    
    conn.commit()
    conn.close()

def get_all_craters():
    """Returns a list of all stored craters."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM craters ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_crater_by_id(crater_id):
    """Returns a single crater by its ID, or None if not found."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM craters WHERE crater_id = ?', (crater_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

if __name__ == '__main__':
    init_db()
