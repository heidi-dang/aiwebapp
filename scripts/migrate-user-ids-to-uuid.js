#!/usr/bin/env node

/**
 * Migration script to convert user IDs from integers to UUIDs
 * Run this before deploying the schema change
 */

import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', '..', 'server.db')

async function migrateUserIds() {
  console.log('Starting user ID migration to UUIDs...')

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  })

  try {
    // Check if migration already run
    const migrationExists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    )

    if (!migrationExists) {
      await db.exec(`
        CREATE TABLE schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `)
    }

    const alreadyMigrated = await db.get(
      "SELECT version FROM schema_migrations WHERE version = 'user_id_to_uuid'"
    )

    if (alreadyMigrated) {
      console.log('Migration already applied, skipping...')
      return
    }

    // Start transaction
    await db.exec('BEGIN TRANSACTION')

    // Create mapping table for old -> new IDs
    await db.exec(`
      CREATE TABLE user_id_mapping (
        old_id INTEGER PRIMARY KEY,
        new_id TEXT NOT NULL UNIQUE
      )
    `)

    // Get all existing users
    const users = await db.all('SELECT id, email FROM users')

    console.log(`Found ${users.length} users to migrate`)

    // Generate new UUIDs and update
    for (const user of users) {
      const newId = randomUUID()

      // Insert mapping
      await db.run(
        'INSERT INTO user_id_mapping (old_id, new_id) VALUES (?, ?)',
        [user.id, newId]
      )

      // Update user
      await db.run(
        'UPDATE users SET id = ? WHERE id = ?',
        [newId, user.id]
      )

      console.log(`Migrated user ${user.email}: ${user.id} -> ${newId}`)
    }

    // Update all foreign key references
    const tablesToUpdate = [
      'user_sessions',
      'social_accounts',
      'user_facts',
      'organization_members'
    ]

    for (const table of tablesToUpdate) {
      console.log(`Updating ${table}...`)
      await db.run(`
        UPDATE ${table}
        SET user_id = (
          SELECT new_id FROM user_id_mapping
          WHERE old_id = ${table}.user_id
        )
        WHERE user_id IN (SELECT old_id FROM user_id_mapping)
      `)
    }

    // Change users.id column type (SQLite allows this)
    await db.exec('ALTER TABLE users RENAME TO users_old')
    await db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      )
    `)
    await db.exec(`
      INSERT INTO users SELECT * FROM users_old
    `)
    await db.exec('DROP TABLE users_old')

    // Record migration
    await db.run(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      ['user_id_to_uuid', Date.now()]
    )

    // Drop mapping table
    await db.exec('DROP TABLE user_id_mapping')

    await db.exec('COMMIT')

    console.log('Migration completed successfully!')

  } catch (error) {
    await db.exec('ROLLBACK')
    console.error('Migration failed:', error)
    throw error
  } finally {
    await db.close()
  }
}

migrateUserIds().catch(console.error)