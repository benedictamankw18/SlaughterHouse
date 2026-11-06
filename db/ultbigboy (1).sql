-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 06, 2026 at 11:23 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ultbigboy`
--
CREATE DATABASE IF NOT EXISTS `ultbigboy` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `ultbigboy`;

-- --------------------------------------------------------

--
-- Table structure for table `account_tokens`
--
-- Creation: Nov 03, 2026 at 03:07 AM
-- Last update: Nov 04, 2026 at 09:56 PM
--

DROP TABLE IF EXISTS `account_tokens`;
CREATE TABLE IF NOT EXISTS `account_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `token_type` varchar(50) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_account_tokens_user_type` (`user_id`,`token_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `account_tokens`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `account_tokens`
--

TRUNCATE TABLE `account_tokens`;
-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--
-- Creation: Nov 03, 2026 at 03:07 AM
-- Last update: Nov 06, 2026 at 02:08 AM
--

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `details_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details_json`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_user_id` (`user_id`),
  KEY `idx_audit_logs_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `audit_logs`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `audit_logs`
--

TRUNCATE TABLE `audit_logs`;
-- --------------------------------------------------------

--
-- Table structure for table `beats`
--
-- Creation: Nov 03, 2026 at 07:26 AM
-- Last update: Nov 04, 2026 at 10:56 PM
--

DROP TABLE IF EXISTS `beats`;
CREATE TABLE IF NOT EXISTS `beats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `bpm` int(11) DEFAULT NULL,
  `musical_key` varchar(255) DEFAULT NULL,
  `genre` varchar(255) DEFAULT NULL,
  `mood` varchar(255) DEFAULT NULL,
  `cover_art` varchar(255) DEFAULT NULL,
  `preview_file` varchar(255) DEFAULT NULL,
  `mp3_file` varchar(255) DEFAULT NULL,
  `wav_file` varchar(255) DEFAULT NULL,
  `stems_file` varchar(255) DEFAULT NULL,
  `basic_price` decimal(12,2) DEFAULT NULL,
  `premium_price` decimal(12,2) DEFAULT NULL,
  `unlimited_price` decimal(12,2) DEFAULT NULL,
  `exclusive_price` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `preview_duration_seconds` int(11) DEFAULT NULL,
  `catalog_status` varchar(20) NOT NULL DEFAULT 'published',
  PRIMARY KEY (`id`),
  KEY `idx_beats_catalog_status` (`catalog_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `beats`:
--

--
-- Truncate table before insert `beats`
--

TRUNCATE TABLE `beats`;
-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--
-- Creation: Nov 03, 2026 at 10:29 AM
--

DROP TABLE IF EXISTS `bookings`;
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `service` varchar(255) NOT NULL,
  `artist_count` int(11) NOT NULL DEFAULT 1,
  `song_count` int(11) DEFAULT NULL,
  `booking_slots_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`booking_slots_json`)),
  `preferred_date` varchar(255) DEFAULT NULL,
  `preferred_time` varchar(255) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'new',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `admin_notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_reference` (`payment_reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `bookings`:
--

--
-- Truncate table before insert `bookings`
--

TRUNCATE TABLE `bookings`;
-- --------------------------------------------------------

--
-- Table structure for table `booking_availability`
--
-- Creation: Nov 03, 2026 at 03:07 AM
--

DROP TABLE IF EXISTS `booking_availability`;
CREATE TABLE IF NOT EXISTS `booking_availability` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slot_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'available',
  `booking_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_booking_slot` (`slot_date`,`start_time`),
  KEY `idx_booking_availability_date` (`slot_date`),
  KEY `fk_booking_availability_booking` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `booking_availability`:
--   `booking_id`
--       `bookings` -> `id`
--

--
-- Truncate table before insert `booking_availability`
--

TRUNCATE TABLE `booking_availability`;
-- --------------------------------------------------------

--
-- Table structure for table `customer_reviews`
--
-- Creation: Nov 04, 2026 at 03:13 AM
-- Last update: Nov 06, 2026 at 02:37 AM
--

DROP TABLE IF EXISTS `customer_reviews`;
CREATE TABLE IF NOT EXISTS `customer_reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) NOT NULL,
  `rating` tinyint(4) NOT NULL,
  `review_text` text NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `user_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer_reviews_user_id` (`user_id`),
  KEY `idx_customer_reviews_status_created` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `customer_reviews`:
--

--
-- Truncate table before insert `customer_reviews`
--

TRUNCATE TABLE `customer_reviews`;
-- --------------------------------------------------------

--
-- Table structure for table `customization_requests`
--
-- Creation: Nov 03, 2026 at 10:42 AM
-- Last update: Nov 06, 2026 at 02:36 AM
--

DROP TABLE IF EXISTS `customization_requests`;
CREATE TABLE IF NOT EXISTS `customization_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_type` varchar(50) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) NOT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `sample_audio_file` varchar(255) DEFAULT NULL,
  `sample_link` text DEFAULT NULL,
  `requested_license` varchar(50) DEFAULT NULL,
  `license_price_gsh` decimal(12,2) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'new',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `user_id` int(11) DEFAULT NULL,
  `quote_gsh` decimal(12,2) DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customization_requests_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `customization_requests`:
--

--
-- Truncate table before insert `customization_requests`
--

TRUNCATE TABLE `customization_requests`;
-- --------------------------------------------------------

--
-- Table structure for table `download_events`
--
-- Creation: Nov 03, 2026 at 10:18 AM
-- Last update: Nov 04, 2026 at 11:30 PM
--

DROP TABLE IF EXISTS `download_events`;
CREATE TABLE IF NOT EXISTS `download_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `order_id` int(11) NOT NULL,
  `beat_id` int(11) NOT NULL,
  `license_type` varchar(50) NOT NULL,
  `format` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_download_events_user_id` (`user_id`),
  KEY `idx_download_events_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `download_events`:
--   `order_id`
--       `orders` -> `id`
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `download_events`
--

TRUNCATE TABLE `download_events`;
-- --------------------------------------------------------

--
-- Table structure for table `email_outbox`
--
-- Creation: Nov 03, 2026 at 08:54 PM
-- Last update: Nov 06, 2026 at 02:06 AM
--

DROP TABLE IF EXISTS `email_outbox`;
CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(255) NOT NULL,
  `recipient` varchar(320) NOT NULL,
  `template` varchar(50) NOT NULL,
  `data_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data_json`)),
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `attempts` int(11) NOT NULL DEFAULT 0,
  `next_attempt_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `last_error` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `idx_email_outbox_delivery` (`status`,`next_attempt_at`,`id`),
  KEY `idx_email_outbox_lease` (`status`,`locked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `email_outbox`:
--

--
-- Truncate table before insert `email_outbox`
--

TRUNCATE TABLE `email_outbox`;
-- --------------------------------------------------------

--
-- Table structure for table `licenses`
--
-- Creation: Nov 06, 2026 at 02:26 AM
--

DROP TABLE IF EXISTS `licenses`;
CREATE TABLE IF NOT EXISTS `licenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `beat_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `license_type` varchar(50) NOT NULL,
  `certificate_path` varchar(255) DEFAULT NULL,
  `rights_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`rights_json`)),
  `purchased_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revoked_reason` varchar(255) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_license_order_beat` (`order_id`,`beat_id`,`license_type`),
  KEY `idx_licenses_user_id` (`user_id`),
  KEY `idx_licenses_beat_id` (`beat_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `licenses`:
--   `beat_id`
--       `beats` -> `id`
--   `order_id`
--       `orders` -> `id`
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `licenses`
--

TRUNCATE TABLE `licenses`;
--
-- Dumping data for table `licenses`
--

INSERT INTO `licenses` (`id`, `user_id`, `beat_id`, `order_id`, `license_type`, `certificate_path`, `rights_json`, `purchased_at`, `revoked_at`, `revoked_reason`, `expires_at`) VALUES
(1, 21, 1, 5, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 05:45:57', NULL, NULL, '2027-11-04 05:45:57'),
(2, 24, 1, 7, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 10:12:35', NULL, NULL, '2027-11-04 10:12:35'),
(3, 24, 1, 8, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 11:59:59', NULL, NULL, '2027-11-04 11:59:59'),
(4, 22, 1, 10, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:19:32', NULL, NULL, '2027-11-04 23:19:32'),
(5, 22, 4, 10, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:19:32', NULL, NULL, '2027-11-04 23:19:32'),
(6, 22, 4, 11, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:28:19', NULL, NULL, '2027-11-04 23:28:19'),
(7, 22, 3, 11, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:28:19', NULL, NULL, '2027-11-04 23:28:19'),
(8, 22, 2, 12, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42'),
(9, 22, 1, 12, 'basic', NULL, '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42'),
(10, 22, 1, 12, 'unlimited', NULL, '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42'),
(11, 22, 2, 12, 'unlimited', NULL, '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42'),
(12, 22, 3, 12, 'unlimited', NULL, '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42'),
(13, 22, 4, 12, 'unlimited', NULL, '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 23:29:42', NULL, NULL, '2027-11-04 23:29:42');

-- --------------------------------------------------------

--
-- Table structure for table `license_certificates`
--
-- Creation: Nov 05, 2026 at 12:26 AM
-- Last update: Nov 05, 2026 at 12:58 AM
--

DROP TABLE IF EXISTS `license_certificates`;
CREATE TABLE IF NOT EXISTS `license_certificates` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `certificate_id` varchar(48) NOT NULL,
  `verification_token_hash` char(64) NOT NULL,
  `license_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `beat_id` int(11) NOT NULL,
  `license_type` varchar(50) NOT NULL,
  `license_terms_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`license_terms_snapshot`)),
  `terms_version` varchar(40) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'valid',
  `reissued_from_id` bigint(20) DEFAULT NULL,
  `issued_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revocation_reason` varchar(500) DEFAULT NULL,
  `pdf_storage_path` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `certificate_id` (`certificate_id`),
  UNIQUE KEY `verification_token_hash` (`verification_token_hash`),
  KEY `idx_license_certificates_license_id` (`license_id`),
  KEY `idx_license_certificates_user_id` (`user_id`),
  KEY `idx_license_certificates_order_id` (`order_id`),
  KEY `idx_license_certificates_beat_id` (`beat_id`),
  KEY `idx_license_certificates_status_issued` (`status`,`issued_at`),
  KEY `fk_license_certificates_order_item` (`order_item_id`),
  KEY `fk_license_certificates_reissued_from` (`reissued_from_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `license_certificates`:
--   `beat_id`
--       `beats` -> `id`
--   `license_id`
--       `licenses` -> `id`
--   `order_id`
--       `orders` -> `id`
--   `order_item_id`
--       `order_items` -> `id`
--   `reissued_from_id`
--       `license_certificates` -> `id`
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `license_certificates`
--

TRUNCATE TABLE `license_certificates`;
--
-- Dumping data for table `license_certificates`
--

INSERT INTO `license_certificates` (`id`, `certificate_id`, `verification_token_hash`, `license_id`, `user_id`, `order_id`, `order_item_id`, `beat_id`, `license_type`, `license_terms_snapshot`, `terms_version`, `status`, `reissued_from_id`, `issued_at`, `revoked_at`, `revocation_reason`, `pdf_storage_path`, `created_at`, `updated_at`) VALUES
(1, 'UBB-CERT-2026-99DB404A287ADAE9', 'f4bc6573ace7e758abc8cc193bf720a1e9911e834c8fab9bb8a8003f0ff6df24', 11, 22, 12, 11, 2, 'unlimited', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(5, 'UBB-CERT-2026-8AE7700F1D8D1F70', '45d690ff7315999cb73d77f61f5e4b353c9713f2882e49f60fded965b2e9413a', 6, 22, 11, 6, 4, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(7, 'UBB-CERT-2026-E8B54F3BD9115598', '6c3c2e10011dc32278faa5db631ee72b27b2e7b86ce5dafebddbe0e7360b536d', 9, 22, 12, 9, 1, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(8, 'UBB-CERT-2026-4440DC4F2141688C', 'cccaeb368426a5c65da056ced911cc1e979c8b92ef3f20ff207b6ee06c457a1e', 13, 22, 12, 13, 4, 'unlimited', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(9, 'UBB-CERT-2026-2BD37D975AA41ABC', '0de6d9710f399523e21459fd40abd9d595278d49d14987db01c0c7dff872baa3', 8, 22, 12, 8, 2, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(10, 'UBB-CERT-2026-A01B53686A089660', '5680c6d6ca6533aec8ce13dafaa1140f2c98f574354122bf7030989baa80841c', 12, 22, 12, 12, 3, 'unlimited', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:33', NULL, NULL, NULL, '2026-11-05 00:53:33', '2026-11-05 00:53:33'),
(11, 'UBB-CERT-2026-094FD3F0D17E982E', '8fca4dd17ce277a1752c2aa660e970d8601f916dae091a9448b8f6d3954704c8', 10, 22, 12, 10, 1, 'unlimited', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:52', NULL, NULL, 'UBB-CERT-2026-094FD3F0D17E982E-valid.pdf', '2026-11-05 00:53:52', '2026-11-05 00:58:47'),
(12, 'UBB-CERT-2026-B92F7ACA30CBBBE9', 'ced5450b3b634980c563f4606130ddb94c9c26d8640b1be26989b1de5da7a5e6', 4, 22, 10, 4, 1, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:52', NULL, NULL, NULL, '2026-11-05 00:53:52', '2026-11-05 00:53:52'),
(13, 'UBB-CERT-2026-5BCABB41B3563D23', '97382900b1f02bce331fa5a3c2e476cf2ae03aed0a6d7738386ef610d024021b', 7, 22, 11, 7, 3, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:52', NULL, NULL, NULL, '2026-11-05 00:53:52', '2026-11-05 00:53:52'),
(14, 'UBB-CERT-2026-D8E9300B07886D03', 'abc630399277c4ad911023eba71eb48b92ff7d555f3f6f1922fa4f1a617718d6', 5, 22, 10, 5, 4, 'basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', 'UBB-MUSIC-LICENSE-2026-11-V1', 'valid', NULL, '2026-11-05 00:53:52', NULL, NULL, NULL, '2026-11-05 00:53:52', '2026-11-05 00:53:52');

-- --------------------------------------------------------

--
-- Table structure for table `license_certificate_history`
--
-- Creation: Nov 05, 2026 at 12:26 AM
-- Last update: Nov 05, 2026 at 12:53 AM
--

DROP TABLE IF EXISTS `license_certificate_history`;
CREATE TABLE IF NOT EXISTS `license_certificate_history` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `certificate_id` bigint(20) NOT NULL,
  `action` varchar(30) NOT NULL,
  `actor_user_id` int(11) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `details_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_license_certificate_history_certificate` (`certificate_id`,`created_at`),
  KEY `fk_license_certificate_history_actor` (`actor_user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `license_certificate_history`:
--   `actor_user_id`
--       `users` -> `id`
--   `certificate_id`
--       `license_certificates` -> `id`
--

--
-- Truncate table before insert `license_certificate_history`
--

TRUNCATE TABLE `license_certificate_history`;
--
-- Dumping data for table `license_certificate_history`
--

INSERT INTO `license_certificate_history` (`id`, `certificate_id`, `action`, `actor_user_id`, `reason`, `details_json`, `created_at`) VALUES
(1, 1, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(2, 5, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(3, 7, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(4, 8, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(5, 9, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(6, 10, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:33'),
(7, 11, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:52'),
(8, 12, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:52'),
(9, 13, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:52'),
(10, 14, 'issued', NULL, NULL, '{\"termsVersion\":\"UBB-MUSIC-LICENSE-2026-11-V1\",\"previousCertificateId\":null}', '2026-11-05 00:53:52');

-- --------------------------------------------------------

--
-- Table structure for table `license_definition_status`
--
-- Creation: Nov 04, 2026 at 11:40 AM
--

DROP TABLE IF EXISTS `license_definition_status`;
CREATE TABLE IF NOT EXISTS `license_definition_status` (
  `license_type` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`license_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `license_definition_status`:
--

--
-- Truncate table before insert `license_definition_status`
--

TRUNCATE TABLE `license_definition_status`;
--
-- Dumping data for table `license_definition_status`
--

INSERT INTO `license_definition_status` (`license_type`, `is_active`, `updated_at`) VALUES
('basic', 1, '2026-11-04 11:40:06'),
('exclusive', 1, '2026-11-04 11:40:06'),
('premium', 1, '2026-11-04 11:40:06'),
('unlimited', 1, '2026-11-04 11:40:06');

-- --------------------------------------------------------

--
-- Table structure for table `license_rights`
--
-- Creation: Nov 03, 2026 at 06:53 PM
--

DROP TABLE IF EXISTS `license_rights`;
CREATE TABLE IF NOT EXISTS `license_rights` (
  `license_type` varchar(50) NOT NULL,
  `rights_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`rights_json`)),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`license_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `license_rights`:
--

--
-- Truncate table before insert `license_rights`
--

TRUNCATE TABLE `license_rights`;
--
-- Dumping data for table `license_rights`
--

INSERT INTO `license_rights` (`license_type`, `rights_json`, `updated_at`) VALUES
('basic', '{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}', '2026-11-04 11:48:56'),
('exclusive', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true,\"resaleProhibited\":true}', '2026-11-03 18:53:52'),
('premium', '{\"formats\":[\"mp3\",\"wav\"],\"commercialUse\":true,\"distribution\":false,\"stems\":false}', '2026-11-03 18:53:52'),
('unlimited', '{\"formats\":[\"mp3\",\"wav\",\"stems\"],\"commercialUse\":true,\"distribution\":true,\"stems\":true}', '2026-11-03 18:53:52');

-- --------------------------------------------------------

--
-- Table structure for table `merchandise`
--
-- Creation: Nov 04, 2026 at 11:16 AM
-- Last update: Nov 06, 2026 at 02:08 AM
--

DROP TABLE IF EXISTS `merchandise`;
CREATE TABLE IF NOT EXISTS `merchandise` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(12,2) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `stock_quantity` int(11) DEFAULT NULL,
  `catalog_status` varchar(20) NOT NULL DEFAULT 'published',
  PRIMARY KEY (`id`),
  KEY `idx_merchandise_stock_quantity` (`stock_quantity`),
  KEY `idx_merchandise_catalog_status` (`catalog_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `merchandise`:
--

--
-- Truncate table before insert `merchandise`
--

TRUNCATE TABLE `merchandise`;
-- --------------------------------------------------------

--
-- Table structure for table `merchandise_categories`
--
-- Creation: Nov 03, 2026 at 03:07 AM
--

DROP TABLE IF EXISTS `merchandise_categories`;
CREATE TABLE IF NOT EXISTS `merchandise_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `merchandise_categories`:
--

--
-- Truncate table before insert `merchandise_categories`
--

TRUNCATE TABLE `merchandise_categories`;
-- --------------------------------------------------------

--
-- Table structure for table `merchandise_variants`
--
-- Creation: Nov 03, 2026 at 03:07 AM
--

DROP TABLE IF EXISTS `merchandise_variants`;
CREATE TABLE IF NOT EXISTS `merchandise_variants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `merchandise_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `fk_merchandise_variants_product` (`merchandise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `merchandise_variants`:
--   `merchandise_id`
--       `merchandise` -> `id`
--

--
-- Truncate table before insert `merchandise_variants`
--

TRUNCATE TABLE `merchandise_variants`;
-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--
-- Creation: Nov 03, 2026 at 09:38 PM
-- Last update: Nov 06, 2026 at 02:37 AM
--

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `dedupe_key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notifications_dedupe_key` (`dedupe_key`),
  KEY `idx_notifications_user_read` (`user_id`,`read_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `notifications`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `notifications`
--

TRUNCATE TABLE `notifications`;
-- --------------------------------------------------------

--
-- Table structure for table `orders`
--
-- Creation: Nov 03, 2026 at 07:06 PM
-- Last update: Nov 06, 2026 at 02:06 AM
--

DROP TABLE IF EXISTS `orders`;
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `items_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`items_json`)),
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `fulfillment_status` varchar(50) NOT NULL DEFAULT 'unfulfilled',
  `refunded_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refunded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  KEY `idx_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `orders`:
--

--
-- Truncate table before insert `orders`
--

TRUNCATE TABLE `orders`;
-- --------------------------------------------------------

--
-- Table structure for table `order_fulfillment_history`
--
-- Creation: Nov 04, 2026 at 03:34 AM
--

DROP TABLE IF EXISTS `order_fulfillment_history`;
CREATE TABLE IF NOT EXISTS `order_fulfillment_history` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `status` varchar(50) NOT NULL,
  `changed_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_order_fulfillment_history_order_created` (`order_id`,`created_at`),
  KEY `fk_order_fulfillment_history_user` (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `order_fulfillment_history`:
--   `order_id`
--       `orders` -> `id`
--   `changed_by`
--       `users` -> `id`
--

--
-- Truncate table before insert `order_fulfillment_history`
--

TRUNCATE TABLE `order_fulfillment_history`;
-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--
-- Creation: Nov 03, 2026 at 03:07 AM
-- Last update: Nov 06, 2026 at 02:06 AM
--

DROP TABLE IF EXISTS `order_items`;
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `product_type` varchar(50) NOT NULL,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `license_type` varchar(50) DEFAULT NULL,
  `unit_amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `order_items`:
--   `order_id`
--       `orders` -> `id`
--

--
-- Truncate table before insert `order_items`
--

TRUNCATE TABLE `order_items`;
-- --------------------------------------------------------

--
-- Table structure for table `payments`
--
-- Creation: Nov 03, 2026 at 03:07 AM
-- Last update: Nov 06, 2026 at 02:06 AM
--

DROP TABLE IF EXISTS `payments`;
CREATE TABLE IF NOT EXISTS `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `provider` varchar(50) NOT NULL,
  `provider_reference` varchar(255) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `provider_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`provider_payload`)),
  `verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `provider_reference` (`provider_reference`),
  KEY `idx_payments_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `payments`:
--   `order_id`
--       `orders` -> `id`
--

--
-- Truncate table before insert `payments`
--

TRUNCATE TABLE `payments`;
-- --------------------------------------------------------

--
-- Table structure for table `payment_webhook_events`
--
-- Creation: Nov 03, 2026 at 10:21 AM
--

DROP TABLE IF EXISTS `payment_webhook_events`;
CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `provider` varchar(50) NOT NULL,
  `event_reference` varchar(255) NOT NULL,
  `event_type` varchar(100) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
  `received_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_webhook_event` (`provider`,`event_reference`,`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `payment_webhook_events`:
--

--
-- Truncate table before insert `payment_webhook_events`
--

TRUNCATE TABLE `payment_webhook_events`;
-- --------------------------------------------------------

--
-- Table structure for table `sales`
--
-- Creation: Nov 03, 2026 at 06:40 PM
-- Last update: Nov 06, 2026 at 02:06 AM
--

DROP TABLE IF EXISTS `sales`;
CREATE TABLE IF NOT EXISTS `sales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_type` varchar(50) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `product_name` varchar(255) NOT NULL,
  `buyer_name` varchar(255) DEFAULT NULL,
  `buyer_email` varchar(255) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `order_reference` varchar(255) DEFAULT NULL,
  `line_index` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_order_line` (`order_reference`,`line_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `sales`:
--

--
-- Truncate table before insert `sales`
--

TRUNCATE TABLE `sales`;
-- --------------------------------------------------------

--
-- Table structure for table `schema_migrations`
--
-- Creation: Nov 03, 2026 at 03:07 AM
-- Last update: Nov 06, 2026 at 02:26 AM
--

DROP TABLE IF EXISTS `schema_migrations`;
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` int(11) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `schema_migrations`:
--

--
-- Truncate table before insert `schema_migrations`
--

TRUNCATE TABLE `schema_migrations`;
-- --------------------------------------------------------

--
-- Table structure for table `settings`
--
-- Creation: Nov 02, 2026 at 10:27 PM
--

DROP TABLE IF EXISTS `settings`;
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` varchar(255) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `settings`:
--

--
-- Truncate table before insert `settings`
--

TRUNCATE TABLE `settings`;
--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
('beat_default_basic_usd', '25'),
('beat_default_exclusive_usd', '420'),
('beat_default_premium_usd', '45'),
('beat_default_unlimited_usd', '150'),
('beat_request_license_basic_ghs', '500'),
('beat_request_license_exclusive_ghs', '4700'),
('beat_request_license_premium_ghs', '1000'),
('beat_request_license_unlimited_ghs', '2000'),
('booking_fee_adverts_promos_ghs', '1000'),
('booking_fee_beat_production_ghs', '500'),
('booking_fee_full_production_ghs', '1000'),
('booking_fee_mixtape_ghs', '700');

-- --------------------------------------------------------

--
-- Table structure for table `stream_releases`
--
-- Creation: Nov 04, 2026 at 04:17 AM
--

DROP TABLE IF EXISTS `stream_releases`;
CREATE TABLE IF NOT EXISTS `stream_releases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `artist` varchar(500) NOT NULL,
  `credits_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`credits_json`)),
  `cover_url` varchar(1000) NOT NULL,
  `links_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`links_json`)),
  `sort_order` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'published',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `title` (`title`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `stream_releases`:
--

--
-- Truncate table before insert `stream_releases`
--

TRUNCATE TABLE `stream_releases`;
--
-- Dumping data for table `stream_releases`
--

INSERT INTO `stream_releases` (`id`, `title`, `artist`, `credits_json`, `cover_url`, `links_json`, `sort_order`, `status`, `created_at`) VALUES
(1, 'AMUSEMENT', 'Derry J', '[\"Producer: Derry J99\"]', 'Images/Amusement.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/3w3RsTz1UFWInx1Okfuf0v?si=8f939c7aef0348e8\",\"label\":\"Listen to Amusement on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/derry_j99/song/amusement\",\"label\":\"Listen to Amusement on Audiomack\"}]', 1, 'published', '2026-11-04 04:17:10'),
(2, 'ANTISOCIAL (REMIX)', 'Kwasi Morgan ft. 39/40', '[\"Producer: Derry J99\"]', 'Images/Antisocial.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/66LM0ycdBfhNLgfde7bjeB?si=3fa5d579fdaa45d5\",\"label\":\"Listen to Antisocial Remix on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/kwasi-morgan/song/antisocial-remix\",\"label\":\"Listen to Antisocial Remix on Audiomack\"}]', 2, 'published', '2026-11-04 04:17:10'),
(3, 'ABOM', 'Kwasi Morgan ft. 39/40', '[\"Producer: Derry J99\"]', 'Images/Abom.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/6c9zYOHkuv8KCTv2ka47AG?si=deecddd9163c4910\",\"label\":\"Listen to Abom on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/kwasi-morgan/song/abom\",\"label\":\"Listen to Abom on Audiomack\"}]', 3, 'published', '2026-11-04 04:17:10'),
(4, 'NOT AGAIN', 'Yaw Wazinga', '[\"Producer: Derry J99\"]', 'Images/Not Again.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/1m3xcixV4v7U3pWFaqufBt?si=6e537d21430d439f\",\"label\":\"Listen to Not Again on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/yaw-wazinga/song/not-again\",\"label\":\"Listen to Not Again on Audiomack\"}]', 4, 'published', '2026-11-04 04:17:10'),
(5, 'LOW', 'Ypee ft. Lami Jnr, Droplord SAS and Chief Kay', '[\"Recording Engineer: Derry J99\"]', 'Images/Low.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/70IsI3YHceS3z7Ezg5JYV0?si=f7c90b244a134476\",\"label\":\"Listen to Low on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/ypee-4/song/low\",\"label\":\"Listen to Low on Audiomack\"}]', 5, 'published', '2026-11-04 04:17:10'),
(6, 'ADWUMA', 'Oseikrom Sikani ft. King Paluta', '[\"Synth, Brass and Guitar: Derry J99\"]', 'Images/Adwuma.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/0O7qfw4nmcPwAOENrPoGcq?si=e877824de3c54fa0\",\"label\":\"Listen to Adwuma on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/sikaniioseikrom/song/adwuma\",\"label\":\"Listen to Adwuma on Audiomack\"}]', 6, 'published', '2026-11-04 04:17:10'),
(7, 'ENCHI PARTY', 'Lil Twitch', '[\"Producer: Derry J99\"]', 'Images/Enchi Party.webp', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/lil_twitch101/song/enchi-party\",\"label\":\"Listen to Enchi Party by Lil Twitch on Audiomack\"}]', 7, 'published', '2026-11-04 04:17:10'),
(8, 'PROPOSAL', 'Yhung King ft. Okese 1', '[\"Producer: Derry J99\"]', 'Images/Proposal.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/09dlwAfnDPYAfP3FdopAYH?si=5a5e1db19f6042dc\",\"label\":\"Listen to Proposal by Yhung King featuring Okese 1 on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/search?q=Proposal%20Yhung%20King%20Okese%201\",\"label\":\"Search Audiomack for Proposal by Yhung King featuring Okese 1\"}]', 8, 'published', '2026-11-04 04:17:10'),
(9, 'OPUEH', 'Yhung King', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/yhung-king/d77c236054.webp?width=416', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/2hUJSgNctjSjfZreUuazJp?si=db570daedd334da7\",\"label\":\"Listen to Opueh by Yhung King on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/yhung-king/song/6949d342cbbc0\",\"label\":\"Listen to Opueh by Yhung King on Audiomack\"}]', 9, 'published', '2026-11-04 04:17:10'),
(10, 'NEVER LET GO', 'Yamel ft. Jidthagr8', '[\"Producer: Derry J99\"]', 'Images/Never Let Go.jpg', '[{\"platform\":\"Spotify\",\"url\":\"https://open.spotify.com/track/3PmpUrLx9WIobkRNjDECzT?si=bfad8a8297fb4172\",\"label\":\"Listen to Never Let Go by Yamel featuring Jidthagr8 on Spotify\"},{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/search?q=Never%20Let%20Go%20Yamel%20Jidthagr8\",\"label\":\"Search Audiomack for Never Let Go by Yamel featuring Jidthagr8\"}]', 10, 'published', '2026-11-04 04:17:10'),
(11, 'PILOLO', 'PCEE GH', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/pcee1993/da74f4e5f3.webp?width=416', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/pcee1993/song/p-cee-pilolo\",\"label\":\"Listen to PILOLO on Audiomack\"}]', 11, 'published', '2026-11-04 04:17:10'),
(12, 'JEALOUS', 'BELLOBOY', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/belloboy-68de971da9672/194b775d09.webp?width=416', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/belloboy-68de971da9672/song/jealous-1\",\"label\":\"Listen to Jealous on Audiomack\"}]', 12, 'published', '2026-11-04 04:17:10'),
(13, 'NANA', 'YAW WAZINGA', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/yaw-wazinga/e298803320.webp?width=416', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/yaw-wazinga/song/nana\",\"label\":\"Listen to NANA on Audiomack\"}]', 13, 'published', '2026-11-04 04:17:10'),
(14, 'STILL I RISE', 'YAW WAZINGA', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/yaw-wazinga/7661842ba7.webp?width=416', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/yaw-wazinga/song/still-i-rise\",\"label\":\"Listen to STILL I RISE on Audiomack\"}]', 14, 'published', '2026-11-04 04:17:10'),
(15, 'GRACE', 'Jidthagr8 ft. Yamel', '[\"Producer: Derry J99\"]', 'https://i.audiomack.com/-Jidthagr8/552638b1df.webp?width=416', '[{\"platform\":\"Audiomack\",\"url\":\"https://audiomack.com/-Jidthagr8/song/68c0f74fe7b40\",\"label\":\"Listen to Grace by Jid Tha Gr8 featuring Yamel on Audiomack\"}]', 15, 'published', '2026-11-04 04:17:10');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--
-- Creation: Nov 03, 2026 at 03:13 AM
-- Last update: Nov 06, 2026 at 10:15 AM
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `first_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `artist_name` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'non_artist',
  `address` text DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `email_verified_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `users`:
--

--
-- Truncate table before insert `users`
--

TRUNCATE TABLE `users`;
--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `first_name`, `last_name`, `artist_name`, `phone`, `role`, `address`, `password_hash`, `created_at`, `email_verified_at`) VALUES
(18, 'John Doe', 'admin12@example.com', 'John', 'Doe', NULL, '88886667', 'admin', '123 Main St', '572fe3d729eddf98745e3229bff1f06d:c18cad103f7b5f7ace731eeb0a2eab5c011b724c0e1eb1b8ef7452146c29881e58bca7826afc93009766c0c4ae7d4a9191fdc5fca8d9c06b046955c2c3ffae83', '2026-11-03 02:31:44', NULL),
(25, 'John Doe', 'super12@example.com', 'John', 'Doe', NULL, '67832883', 'super_admin', '123 Main St', 'scrypt$32768$8$1$38e2ce96a6b80e44498f6c171b5fe08f$97632f21e141764e7dffa346ac85b81d08c2980ddf315e866457c95da9ce83edb35086d4ed400a1ff63c50865792e31ff29629e2e9b39875dc8885c392df984e', '2026-11-04 10:22:50', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user_sessions`
--
-- Creation: Nov 05, 2026 at 09:05 PM
-- Last update: Nov 06, 2026 at 03:12 AM
--

DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `role` varchar(50) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_used_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `csrf_token_hash` char(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_user_sessions_user_id` (`user_id`),
  KEY `idx_user_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `user_sessions`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `user_sessions`
--

TRUNCATE TABLE `user_sessions`;
-- --------------------------------------------------------

--
-- Table structure for table `wishlists`
--
-- Creation: Nov 03, 2026 at 03:07 AM
--

DROP TABLE IF EXISTS `wishlists`;
CREATE TABLE IF NOT EXISTS `wishlists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `beat_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishlist_user_beat` (`user_id`,`beat_id`),
  KEY `fk_wishlists_beat` (`beat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `wishlists`:
--   `beat_id`
--       `beats` -> `id`
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `wishlists`
--

TRUNCATE TABLE `wishlists`;
-- --------------------------------------------------------

--
-- Table structure for table `withdrawals`
--
-- Creation: Nov 02, 2026 at 10:27 PM
-- Last update: Nov 06, 2026 at 10:08 AM
--

DROP TABLE IF EXISTS `withdrawals`;
CREATE TABLE IF NOT EXISTS `withdrawals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `amount` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `withdrawals`:
--

--
-- Truncate table before insert `withdrawals`
--

TRUNCATE TABLE `withdrawals`;
--
-- Constraints for dumped tables
--

--
-- Constraints for table `account_tokens`
--
ALTER TABLE `account_tokens`
  ADD CONSTRAINT `fk_account_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `booking_availability`
--
ALTER TABLE `booking_availability`
  ADD CONSTRAINT `fk_booking_availability_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `download_events`
--
ALTER TABLE `download_events`
  ADD CONSTRAINT `fk_download_events_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_download_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `licenses`
--
ALTER TABLE `licenses`
  ADD CONSTRAINT `fk_licenses_beat` FOREIGN KEY (`beat_id`) REFERENCES `beats` (`id`),
  ADD CONSTRAINT `fk_licenses_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `fk_licenses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `license_certificates`
--
ALTER TABLE `license_certificates`
  ADD CONSTRAINT `fk_license_certificates_beat` FOREIGN KEY (`beat_id`) REFERENCES `beats` (`id`),
  ADD CONSTRAINT `fk_license_certificates_license` FOREIGN KEY (`license_id`) REFERENCES `licenses` (`id`),
  ADD CONSTRAINT `fk_license_certificates_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `fk_license_certificates_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_license_certificates_reissued_from` FOREIGN KEY (`reissued_from_id`) REFERENCES `license_certificates` (`id`),
  ADD CONSTRAINT `fk_license_certificates_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `license_certificate_history`
--
ALTER TABLE `license_certificate_history`
  ADD CONSTRAINT `fk_license_certificate_history_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_license_certificate_history_certificate` FOREIGN KEY (`certificate_id`) REFERENCES `license_certificates` (`id`);

--
-- Constraints for table `merchandise_variants`
--
ALTER TABLE `merchandise_variants`
  ADD CONSTRAINT `fk_merchandise_variants_product` FOREIGN KEY (`merchandise_id`) REFERENCES `merchandise` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `order_fulfillment_history`
--
ALTER TABLE `order_fulfillment_history`
  ADD CONSTRAINT `fk_order_fulfillment_history_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_order_fulfillment_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `wishlists`
--
ALTER TABLE `wishlists`
  ADD CONSTRAINT `fk_wishlists_beat` FOREIGN KEY (`beat_id`) REFERENCES `beats` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_wishlists_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
SET FOREIGN_KEY_CHECKS=1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
