-- Migration 026: Add descripcion column to tareas table
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS descripcion TEXT;
