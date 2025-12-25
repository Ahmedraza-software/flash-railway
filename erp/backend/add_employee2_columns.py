"""Add new columns to employees2 table for avatar, attachments, and bank accounts."""

import sqlite3

def add_columns():
    conn = sqlite3.connect('flash_erp.db')
    cursor = conn.cursor()
    
    # New columns to add
    new_columns = [
        ('avatar_url', 'TEXT'),
        ('cnic_attachment', 'TEXT'),
        ('domicile_attachment', 'TEXT'),
        ('sho_verified_attachment', 'TEXT'),
        ('ssp_verified_attachment', 'TEXT'),
        ('khidmat_verified_attachment', 'TEXT'),
        ('police_trg_attachment', 'TEXT'),
        ('bank_accounts', 'TEXT'),
    ]
    
    for col_name, col_type in new_columns:
        try:
            cursor.execute(f'ALTER TABLE employees2 ADD COLUMN {col_name} {col_type}')
            print(f'Added column: {col_name}')
        except sqlite3.OperationalError as e:
            if 'duplicate column name' in str(e).lower():
                print(f'Column {col_name} already exists')
            else:
                print(f'Error adding {col_name}: {e}')
    
    conn.commit()
    conn.close()
    print('Done!')

if __name__ == '__main__':
    add_columns()
