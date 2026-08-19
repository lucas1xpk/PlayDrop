CREATE DATABASE IF NOT EXISTS playdrop
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE playdrop;

CREATE TABLE IF NOT EXISTS games (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_game_id VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  image_url TEXT NULL,
  steam_app_id VARCHAR(30) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_provider_game (provider_game_id)
);

CREATE TABLE IF NOT EXISTS stores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  brazil_verified TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id BIGINT UNSIGNED NOT NULL,
  store_id INT UNSIGNED NOT NULL,
  activation_platform VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  normal_price DECIMAL(10,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  discount_percent INT NOT NULL DEFAULT 0,
  offer_url TEXT NULL,
  brazil_verified TINYINT(1) NOT NULL DEFAULT 0,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_price_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_price_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_price_game_date (game_id, captured_at),
  INDEX idx_price_brazil (brazil_verified)
);

INSERT INTO stores (name, slug, brazil_verified)
VALUES ('Steam', 'steam', 1)
ON DUPLICATE KEY UPDATE brazil_verified = VALUES(brazil_verified);
