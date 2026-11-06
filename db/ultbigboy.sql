-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 06, 2026 at 10:29 AM
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `account_tokens`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `account_tokens`
--

TRUNCATE TABLE `account_tokens`;
--
-- Dumping data for table `account_tokens`
--

INSERT INTO `account_tokens` (`id`, `user_id`, `token_hash`, `token_type`, `expires_at`, `used_at`, `created_at`) VALUES
(2, 21, 'e9cd403b09611c6ed9e6bfef91e90c64f3ee5c78714c9f7672e87c47bda02da3', 'email_verification', '2026-11-05 04:58:07', NULL, '2026-11-04 04:58:07'),
(3, 22, '30933e2e28af81d25cf181c1d8af273c78b27cbbe493da41b7dda300a51ad58a', 'email_verification', '2026-11-05 05:47:58', '2026-11-04 21:56:23', '2026-11-04 05:47:58'),
(4, 24, 'cf4ac557caa65e4b0a73fb775dcbd72c1557768670cd5aa7f2b1f81883ad0851', 'email_verification', '2026-11-05 08:06:12', '2026-11-04 08:08:52', '2026-11-04 08:06:12'),
(5, 24, 'a74f4328afd7bf2a054cf3c26a3ce535a72e755ee3794708be3e26adb88b7b37', 'email_verification', '2026-11-05 08:08:52', '2026-11-04 08:08:59', '2026-11-04 08:08:52'),
(6, 25, '16984681e6469e840543574c6c9793bdd9c522674c6cef16caeb9b2ede31eb09', 'email_verification', '2026-11-05 10:22:50', NULL, '2026-11-04 10:22:50'),
(7, 22, '381285d2ac800c04a16f861920a1f318fce1eed3468628f9b22b264712956d72', 'password_reset', '2026-11-04 22:52:58', '2026-11-04 21:55:43', '2026-11-04 21:52:58'),
(8, 22, '77ee42adfa99bf44afcc6c306d2563e307366000786853ce8d6812cd5f3428e2', 'email_verification', '2026-11-05 21:56:23', '2026-11-04 21:56:25', '2026-11-04 21:56:23');

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
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `audit_logs`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `audit_logs`
--

TRUNCATE TABLE `audit_logs`;
--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`id`, `user_id`, `action`, `entity_type`, `entity_id`, `details_json`, `ip_address`, `created_at`) VALUES
(1, NULL, 'customer_login_failed', NULL, NULL, '{\"identifierType\":\"phone\"}', '::ffff:127.0.0.1', '2026-11-04 04:46:44'),
(2, NULL, 'account_created', 'user', 19, '{\"role\":\"artist\"}', '::ffff:127.0.0.1', '2026-11-04 04:55:09'),
(3, 21, 'account_created', 'user', 21, '{\"role\":\"artist\"}', '::ffff:127.0.0.1', '2026-11-04 04:58:07'),
(4, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::ffff:127.0.0.1', '2026-11-04 04:59:48'),
(5, 21, 'customer_login', 'user', 21, NULL, '::ffff:127.0.0.1', '2026-11-04 04:59:48'),
(6, 22, 'account_created', 'user', 22, '{\"role\":\"artist\"}', '::1', '2026-11-04 05:47:58'),
(7, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 05:50:43'),
(8, 22, 'customer_login', 'user', 22, NULL, '::1', '2026-11-04 05:50:43'),
(9, 24, 'account_created', 'user', 24, '{\"role\":\"artist\"}', '::1', '2026-11-04 08:06:12'),
(10, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 08:08:47'),
(11, 24, 'customer_login_blocked_unverified', 'user', 24, NULL, '::1', '2026-11-04 08:08:47'),
(12, 24, 'email_verification_resent', 'user', 24, '{\"emailQueued\":true}', '::1', '2026-11-04 08:08:52'),
(13, 24, 'email_verified', 'user', 24, NULL, '::1', '2026-11-04 08:08:59'),
(14, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 08:10:02'),
(15, 24, 'customer_login', 'user', 24, NULL, '::1', '2026-11-04 08:10:02'),
(16, 24, 'customer_logout', 'user', 24, NULL, '::1', '2026-11-04 09:35:46'),
(17, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 09:35:54'),
(18, 24, 'customer_login', 'user', 24, NULL, '::1', '2026-11-04 09:35:54'),
(19, 24, 'customer_logout', 'user', 24, NULL, '::1', '2026-11-04 09:36:08'),
(20, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 10:03:00'),
(21, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 10:03:23'),
(22, 24, 'customer_login', 'user', 24, NULL, '::1', '2026-11-04 10:03:23'),
(23, 24, 'customer_logout', 'user', 24, NULL, '::1', '2026-11-04 10:14:31'),
(24, 18, 'admin_login', 'user', 18, NULL, '::1', '2026-11-04 10:17:07'),
(25, 25, 'account_created', 'user', 25, '{\"role\":\"non_artist\"}', '::1', '2026-11-04 10:22:50'),
(26, 18, 'admin_logout', 'user', 18, NULL, '::1', '2026-11-04 10:23:07'),
(27, 25, 'admin_login', 'user', 25, NULL, '::1', '2026-11-04 10:37:11'),
(28, 25, 'admin_logout', 'user', 25, NULL, '::1', '2026-11-04 10:39:25'),
(29, 25, 'admin_login', 'user', 25, NULL, '::1', '2026-11-04 10:39:29'),
(30, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"published\"}', '::1', '2026-11-04 10:40:23'),
(31, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"published\"}', '::1', '2026-11-04 10:40:24'),
(32, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"published\"}', '::1', '2026-11-04 10:40:24'),
(33, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"published\"}', '::1', '2026-11-04 10:40:25'),
(34, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"unpublished\"}', '::1', '2026-11-04 11:10:57'),
(35, 25, 'beat_status_changed', 'beat', 1, '{\"status\":\"published\"}', '::1', '2026-11-04 11:11:01'),
(36, 25, 'license_rights_updated', 'license_rights', NULL, '{\"licenseType\":\"basic\",\"rights\":{\"formats\":[\"mp3\"],\"commercialUse\":false,\"distribution\":false,\"stems\":false,\"usageLimits\":{},\"distributionRules\":[]}}', '::1', '2026-11-04 11:48:56'),
(37, 25, 'admin_login', 'user', 25, NULL, '::1', '2026-11-04 11:57:44'),
(38, 25, 'admin_logout', 'user', 25, NULL, '::1', '2026-11-04 11:57:48'),
(39, 18, 'admin_login', 'user', 18, NULL, '::1', '2026-11-04 11:58:05'),
(40, 18, 'admin_logout', 'user', 18, NULL, '::1', '2026-11-04 11:58:22'),
(41, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 11:58:34'),
(42, 24, 'customer_login', 'user', 24, NULL, '::1', '2026-11-04 11:58:34'),
(43, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::ffff:127.0.0.1', '2026-11-04 21:51:45'),
(44, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::ffff:127.0.0.1', '2026-11-04 21:52:01'),
(45, NULL, 'customer_login_failed', NULL, NULL, '{\"identifierType\":\"email\"}', '::ffff:127.0.0.1', '2026-11-04 21:52:01'),
(46, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::ffff:127.0.0.1', '2026-11-04 21:52:39'),
(47, NULL, 'customer_login_failed', NULL, NULL, '{\"identifierType\":\"email\"}', '::ffff:127.0.0.1', '2026-11-04 21:52:39'),
(48, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::ffff:127.0.0.1', '2026-11-04 21:52:50'),
(49, NULL, 'customer_login_failed', NULL, NULL, '{\"identifierType\":\"email\"}', '::ffff:127.0.0.1', '2026-11-04 21:52:50'),
(50, 22, 'password_reset_requested', 'user', 22, NULL, '::ffff:127.0.0.1', '2026-11-04 21:52:58'),
(51, 22, 'password_reset_completed', 'user', 22, NULL, '::1', '2026-11-04 21:55:43'),
(52, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 21:55:59'),
(53, NULL, 'customer_login_failed', NULL, NULL, '{\"identifierType\":\"email\"}', '::1', '2026-11-04 21:55:59'),
(54, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 21:56:10'),
(55, 22, 'customer_login_blocked_unverified', 'user', 22, NULL, '::1', '2026-11-04 21:56:10'),
(56, 22, 'email_verification_resent', 'user', 22, '{\"emailQueued\":true}', '::1', '2026-11-04 21:56:23'),
(57, 22, 'email_verified', 'user', 22, NULL, '::1', '2026-11-04 21:56:25'),
(58, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 21:56:46'),
(59, 22, 'customer_login', 'user', 22, NULL, '::1', '2026-11-04 21:56:46'),
(60, 22, 'customer_logout', 'user', 22, NULL, '::1', '2026-11-04 21:58:11'),
(61, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-04 21:58:20'),
(62, 22, 'customer_login', 'user', 22, NULL, '::1', '2026-11-04 21:58:20'),
(63, 25, 'admin_login', 'user', 25, NULL, '::1', '2026-11-04 22:03:45'),
(64, 25, 'beat_created', 'beat', 2, NULL, '::1', '2026-11-04 22:13:38'),
(65, 25, 'beat_created', 'beat', 3, NULL, '::1', '2026-11-04 22:15:07'),
(66, 25, 'beat_updated', 'beat', 3, NULL, '::1', '2026-11-04 22:28:08'),
(67, 25, 'beat_created', 'beat', 4, NULL, '::1', '2026-11-04 22:54:53'),
(68, 25, 'beat_updated', 'beat', 3, NULL, '::1', '2026-11-04 22:56:31'),
(69, 25, 'review_status_changed', 'customer_review', 1, '{\"status\":\"approved\"}', NULL, '2026-11-04 22:59:55'),
(70, 25, 'admin_login', 'user', 25, NULL, '::1', '2026-11-05 21:48:38'),
(71, NULL, 'admin_login_failed', NULL, NULL, '{\"emailProvided\":true}', '::1', '2026-11-06 01:48:35'),
(72, 22, 'customer_login', 'user', 22, NULL, '::1', '2026-11-06 01:48:35'),
(73, 25, 'merchandise_updated', 'merchandise', 2, NULL, '::1', '2026-11-06 02:08:28'),
(74, 25, 'merchandise_updated', 'merchandise', 1, NULL, '::1', '2026-11-06 02:08:40');

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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `beats`:
--

--
-- Truncate table before insert `beats`
--

TRUNCATE TABLE `beats`;
--
-- Dumping data for table `beats`
--

INSERT INTO `beats` (`id`, `title`, `bpm`, `musical_key`, `genre`, `mood`, `cover_art`, `preview_file`, `mp3_file`, `wav_file`, `stems_file`, `basic_price`, `premium_price`, `unlimited_price`, `exclusive_price`, `created_at`, `preview_duration_seconds`, `catalog_status`) VALUES
(1, 'New Beat', 86, 'C Major', 'Hip Hop', 'Chill', NULL, NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, 100.00, '2026-11-03 00:57:04', NULL, 'published'),
(2, 'Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com)', 4, 'C', 'dsds', 'sdsd', 'cover-1793830417592-1b4447a3.jpg', 'preview-1793830417725-44d72673.mp3', 'mp3-1793830418002-f29d54b1.mp3', 'wav-1793830418087-48a653ec.mp3', 'stems-1793830418216-1e5f6c6c.mp3', 100.00, 200.00, 400.00, 600.00, '2026-11-04 22:13:38', NULL, 'published'),
(3, 'jjjj', 41, 'Ab Major', 'dancehall', 'storytelling', NULL, 'preview-1793830507687-ff83d269.mp3', 'mp3-1793830507726-9cbc6eea.mp3', 'wav-1793830507749-d2374aa3.mp3', 'stems-1793830507769-910d5ec5.mp3', 90.00, 99.00, 99.00, 999.00, '2026-11-04 22:15:07', 7, 'published'),
(4, 'ashghkl;,kj', 42, 'C Minor', 'afrobeat', 'happy', 'cover-1793832893457-c77297f5.jpg', 'preview-1793832893481-463c3f18.mp3', 'mp3-1793832893502-f42b115e.mp3', 'wav-1793832893530-23f161c7.mp3', 'stems-1793832893559-ec7c108c.mp3', 10.00, 50.00, 80.00, 100.00, '2026-11-04 22:54:53', 9, 'published');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `bookings`:
--

--
-- Truncate table before insert `bookings`
--

TRUNCATE TABLE `bookings`;
--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`id`, `name`, `email`, `phone`, `service`, `artist_count`, `song_count`, `booking_slots_json`, `preferred_date`, `preferred_time`, `details`, `payment_reference`, `status`, `created_at`, `admin_notes`) VALUES
(1, 'Benedict ben aaa', 'benedictamankwa18@gmail.com', '+233543779867', 'Mixtape', 2, NULL, '[{\"date\":\"2026-11-10\",\"time\":\"12:03\"}]', '2026-11-10', '12:03', 'tukyluukjhgf', 'UBB-1793786660162-185a2677', 'paid', '2026-11-04 10:04:41', NULL);

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `booking_availability`:
--   `booking_id`
--       `bookings` -> `id`
--

--
-- Truncate table before insert `booking_availability`
--

TRUNCATE TABLE `booking_availability`;
--
-- Dumping data for table `booking_availability`
--

INSERT INTO `booking_availability` (`id`, `slot_date`, `start_time`, `end_time`, `status`, `booking_id`, `created_at`) VALUES
(1, '2026-11-10', '12:03:00', '14:23:00', 'booked', 1, '2026-11-04 10:04:41');

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `customer_reviews`:
--

--
-- Truncate table before insert `customer_reviews`
--

TRUNCATE TABLE `customer_reviews`;
--
-- Dumping data for table `customer_reviews`
--

INSERT INTO `customer_reviews` (`id`, `customer_name`, `customer_email`, `rating`, `review_text`, `status`, `created_at`, `user_id`) VALUES
(1, 'John Doe', 'test1s@example.com', 4, 'hshh', 'approved', '2026-11-03 02:29:51', NULL),
(2, 'John Doe', 'test1s@example.com', 4, 'hshh', 'approved', '2026-11-03 02:29:58', NULL),
(3, 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 2, 'fctctftigtgykgyu', 'pending', '2026-11-06 02:37:36', 22);

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `customization_requests`:
--

--
-- Truncate table before insert `customization_requests`
--

TRUNCATE TABLE `customization_requests`;
--
-- Dumping data for table `customization_requests`
--

INSERT INTO `customization_requests` (`id`, `request_type`, `customer_name`, `customer_email`, `product_name`, `details`, `sample_audio_file`, `sample_link`, `requested_license`, `license_price_gsh`, `status`, `created_at`, `user_id`, `quote_gsh`, `admin_notes`) VALUES
(1, 'beat', 'N3thunt3r', 'benedictamankwa9@gmail.com', 'fghvjbjkhbj', 'jcvytof76fyg6f', NULL, NULL, 'premium', 1000.00, 'new', '2026-11-06 02:36:45', 22, NULL, NULL);

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
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
--
-- Dumping data for table `download_events`
--

INSERT INTO `download_events` (`id`, `user_id`, `order_id`, `beat_id`, `license_type`, `format`, `created_at`) VALUES
(1, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(2, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(3, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(4, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(5, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(6, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(7, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(8, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(9, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(10, 22, 10, 4, 'basic', 'mp3', '2026-11-04 23:19:40'),
(11, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(12, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(13, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(14, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(15, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(16, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(17, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(18, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(19, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(20, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(21, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(22, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01'),
(23, 22, 12, 4, 'unlimited', 'stems', '2026-11-04 23:30:01');

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
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `email_outbox`:
--

--
-- Truncate table before insert `email_outbox`
--

TRUNCATE TABLE `email_outbox`;
--
-- Dumping data for table `email_outbox`
--

INSERT INTO `email_outbox` (`id`, `idempotency_key`, `recipient`, `template`, `data_json`, `status`, `attempts`, `next_attempt_at`, `expires_at`, `locked_at`, `sent_at`, `last_error`, `created_at`) VALUES
(1, 'welcome:19', 'testappwithn3thunt3r@gmail.com', 'welcome', NULL, 'sent', 3, '2026-11-04 04:55:09', NULL, NULL, '2026-11-04 05:54:11', NULL, '2026-11-04 04:55:09'),
(2, 'email-verification:842ac7e4aa0ca482be30afc47f42cde7fb9bd58af1333074261edcd83fc41501', 'testappwithn3thunt3r@gmail.com', 'email_verification', NULL, 'sent', 2, '2026-11-04 04:55:09', '2026-11-05 04:55:09', NULL, '2026-11-04 05:44:09', NULL, '2026-11-04 04:55:09'),
(3, 'welcome:21', 'testappwithn3thunt3r@gmail.com', 'welcome', NULL, 'sent', 1, '2026-11-04 04:58:07', NULL, NULL, '2026-11-04 05:44:09', NULL, '2026-11-04 04:58:07'),
(4, 'email-verification:e9cd403b09611c6ed9e6bfef91e90c64f3ee5c78714c9f7672e87c47bda02da3', 'testappwithn3thunt3r@gmail.com', 'email_verification', NULL, 'sent', 1, '2026-11-04 04:58:07', '2026-11-05 04:58:07', NULL, '2026-11-04 05:44:10', NULL, '2026-11-04 04:58:07'),
(5, 'license-issued:UBB-1793771133212-bdb2ed7a', 'testappwithn3thunt3r@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 05:45:57', NULL, NULL, '2026-11-04 05:46:00', NULL, '2026-11-04 05:45:57'),
(6, 'order-receipt:UBB-1793771133212-bdb2ed7a', 'testappwithn3thunt3r@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 05:45:57', NULL, NULL, '2026-11-04 05:46:01', NULL, '2026-11-04 05:45:57'),
(7, 'welcome:22', 'benedictamankwa9@gmail.com', 'welcome', NULL, 'sent', 1, '2026-11-04 05:47:58', NULL, NULL, '2026-11-04 05:48:00', NULL, '2026-11-04 05:47:58'),
(8, 'email-verification:30933e2e28af81d25cf181c1d8af273c78b27cbbe493da41b7dda300a51ad58a', 'benedictamankwa9@gmail.com', 'email_verification', NULL, 'sent', 1, '2026-11-04 05:47:58', '2026-11-05 05:47:58', NULL, '2026-11-04 05:48:00', NULL, '2026-11-04 05:47:58'),
(9, 'welcome:24', 'benedictamankwa18@gmail.com', 'welcome', NULL, 'sent', 1, '2026-11-04 08:06:12', NULL, NULL, '2026-11-04 08:06:15', NULL, '2026-11-04 08:06:12'),
(10, 'email-verification:cf4ac557caa65e4b0a73fb775dcbd72c1557768670cd5aa7f2b1f81883ad0851', 'benedictamankwa18@gmail.com', 'email_verification', NULL, 'sent', 1, '2026-11-04 08:06:12', '2026-11-05 08:06:12', NULL, '2026-11-04 08:06:16', NULL, '2026-11-04 08:06:12'),
(11, 'email-verification:a74f4328afd7bf2a054cf3c26a3ce535a72e755ee3794708be3e26adb88b7b37', 'benedictamankwa18@gmail.com', 'email_verification', NULL, 'sent', 1, '2026-11-04 08:08:52', '2026-11-05 08:08:52', NULL, '2026-11-04 08:08:55', NULL, '2026-11-04 08:08:52'),
(12, 'booking-confirmation:UBB-1793786660162-185a2677', 'benedictamankwa18@gmail.com', 'booking_confirmation', NULL, 'sent', 1, '2026-11-04 10:04:41', NULL, NULL, '2026-11-04 10:04:47', NULL, '2026-11-04 10:04:41'),
(13, 'order-receipt:UBB-1793786660162-185a2677', 'benedictamankwa18@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 10:04:41', NULL, NULL, '2026-11-04 10:04:47', NULL, '2026-11-04 10:04:41'),
(14, 'license-issued:UBB-1793787137225-06f97a78', 'benedictamankwa18@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 10:12:35', NULL, NULL, '2026-11-04 10:12:41', NULL, '2026-11-04 10:12:35'),
(15, 'order-receipt:UBB-1793787137225-06f97a78', 'benedictamankwa18@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 10:12:35', NULL, NULL, '2026-11-04 10:12:41', NULL, '2026-11-04 10:12:35'),
(16, 'welcome:25', 'super12@example.com', 'welcome', NULL, 'failed', 8, '2026-11-04 12:35:45', NULL, NULL, NULL, 'Email provider returned HTTP 422.', '2026-11-04 10:22:50'),
(17, 'email-verification:16984681e6469e840543574c6c9793bdd9c522674c6cef16caeb9b2ede31eb09', 'super12@example.com', 'email_verification', NULL, 'failed', 8, '2026-11-04 12:26:45', '2026-11-05 10:22:50', NULL, NULL, 'Email provider returned HTTP 422.', '2026-11-04 10:22:50'),
(18, 'license-issued:UBB-1793793569748-b807259a', 'benedictamankwa18@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 11:59:59', NULL, NULL, '2026-11-04 12:00:02', NULL, '2026-11-04 11:59:59'),
(19, 'order-receipt:UBB-1793793569748-b807259a', 'benedictamankwa18@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 11:59:59', NULL, NULL, '2026-11-04 12:00:03', NULL, '2026-11-04 11:59:59'),
(20, 'password-reset:381285d2ac800c04a16f861920a1f318fce1eed3468628f9b22b264712956d72', 'benedictamankwa9@gmail.com', 'password_reset', NULL, 'sent', 1, '2026-11-04 21:52:58', '2026-11-04 22:52:58', NULL, '2026-11-04 21:53:03', NULL, '2026-11-04 21:52:58'),
(21, 'email-verification:77ee42adfa99bf44afcc6c306d2563e307366000786853ce8d6812cd5f3428e2', 'benedictamankwa9@gmail.com', 'email_verification', NULL, 'sent', 1, '2026-11-04 21:56:23', '2026-11-05 21:56:23', NULL, '2026-11-04 21:56:27', NULL, '2026-11-04 21:56:23'),
(22, 'license-issued:UBB-1793834349728-014e6729', 'benedictamankwa9@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 23:19:32', NULL, NULL, '2026-11-04 23:19:35', NULL, '2026-11-04 23:19:32'),
(23, 'order-receipt:UBB-1793834349728-014e6729', 'benedictamankwa9@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 23:19:32', NULL, NULL, '2026-11-04 23:19:36', NULL, '2026-11-04 23:19:32'),
(24, 'license-issued:UBB-1793834879872-c727fe4d', 'benedictamankwa9@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 23:28:19', NULL, NULL, '2026-11-04 23:28:21', NULL, '2026-11-04 23:28:19'),
(25, 'order-receipt:UBB-1793834879872-c727fe4d', 'benedictamankwa9@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 23:28:19', NULL, NULL, '2026-11-04 23:28:22', NULL, '2026-11-04 23:28:19'),
(26, 'license-issued:UBB-1793834964895-c91e8b18', 'benedictamankwa9@gmail.com', 'license_issued', NULL, 'sent', 1, '2026-11-04 23:29:42', NULL, NULL, '2026-11-04 23:29:47', NULL, '2026-11-04 23:29:42'),
(27, 'order-receipt:UBB-1793834964895-c91e8b18', 'benedictamankwa9@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-04 23:29:42', NULL, NULL, '2026-11-04 23:29:47', NULL, '2026-11-04 23:29:42'),
(28, 'order-receipt:UBB-1793930797365-14bb66dc', 'benedictamankwa9@gmail.com', 'order_receipt', NULL, 'sent', 1, '2026-11-06 02:06:56', NULL, NULL, '2026-11-06 02:06:58', NULL, '2026-11-06 02:06:56');

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `merchandise`:
--

--
-- Truncate table before insert `merchandise`
--

TRUNCATE TABLE `merchandise`;
--
-- Dumping data for table `merchandise`
--

INSERT INTO `merchandise` (`id`, `title`, `description`, `price`, `photo`, `created_at`, `stock_quantity`, `catalog_status`) VALUES
(1, 'hoooo', '', 100.00, 'merchandise-1793930920328-a2a2a0ba.jpg', '2026-11-03 01:01:03', NULL, 'published'),
(2, 'uoll', '', 100.00, 'merchandise-1793930908799-db79a065.png', '2026-11-03 01:02:01', NULL, 'published');

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
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `notifications`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `notifications`
--

TRUNCATE TABLE `notifications`;
--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `type`, `title`, `message`, `read_at`, `created_at`, `dedupe_key`) VALUES
(4, 21, 'order_paid', 'Payment confirmed', 'Order UBB-1793771133212-bdb2ed7a was paid successfully.', NULL, '2026-11-04 05:45:57', NULL),
(5, 21, 'license_created', 'License ready', '1 beat license is now available in your account.', NULL, '2026-11-04 05:45:57', NULL),
(6, 1, 'order_paid', 'Order paid', 'Order UBB-1793771133212-bdb2ed7a from Benedict Amankwa was paid for 250.00 GHS.', NULL, '2026-11-04 05:45:57', 'order-paid:UBB-1793771133212-bdb2ed7a:1'),
(7, 18, 'order_paid', 'Order paid', 'Order UBB-1793771133212-bdb2ed7a from Benedict Amankwa was paid for 250.00 GHS.', NULL, '2026-11-04 05:45:57', 'order-paid:UBB-1793771133212-bdb2ed7a:18'),
(9, 24, 'booking_paid', 'Booking confirmed', 'Mixtape booking UBB-1793786660162-185a2677 is paid and awaiting studio confirmation.', NULL, '2026-11-04 10:04:41', NULL),
(10, 1, 'booking_paid', 'Booking payment received', 'Mixtape booking UBB-1793786660162-185a2677 from Benedict ben aaa was paid.', NULL, '2026-11-04 10:04:41', 'booking-paid:UBB-1793786660162-185a2677:1'),
(11, 18, 'booking_paid', 'Booking payment received', 'Mixtape booking UBB-1793786660162-185a2677 from Benedict ben aaa was paid.', NULL, '2026-11-04 10:04:41', 'booking-paid:UBB-1793786660162-185a2677:18'),
(13, 24, 'order_paid', 'Payment confirmed', 'Order UBB-1793786660162-185a2677 was paid successfully.', NULL, '2026-11-04 10:04:41', NULL),
(14, 24, 'order_paid', 'Payment confirmed', 'Order UBB-1793787137225-06f97a78 was paid successfully.', NULL, '2026-11-04 10:12:35', NULL),
(15, 24, 'license_created', 'License ready', '1 beat license is now available in your account.', NULL, '2026-11-04 10:12:35', NULL),
(16, 1, 'order_paid', 'Order paid', 'Order UBB-1793787137225-06f97a78 from Benedict ben aaa was paid for 250.00 GHS.', NULL, '2026-11-04 10:12:35', 'order-paid:UBB-1793787137225-06f97a78:1'),
(17, 18, 'order_paid', 'Order paid', 'Order UBB-1793787137225-06f97a78 from Benedict ben aaa was paid for 250.00 GHS.', NULL, '2026-11-04 10:12:35', 'order-paid:UBB-1793787137225-06f97a78:18'),
(19, 24, 'order_paid', 'Payment confirmed', 'Order UBB-1793793569748-b807259a was paid successfully.', NULL, '2026-11-04 11:59:59', NULL),
(20, 24, 'license_created', 'License ready', '2 beat licenses is now available in your account.', NULL, '2026-11-04 11:59:59', NULL),
(21, 1, 'order_paid', 'Order paid', 'Order UBB-1793793569748-b807259a from Benedict ben aaa was paid for 500.00 GHS.', NULL, '2026-11-04 11:59:59', 'order-paid:UBB-1793793569748-b807259a:1'),
(22, 18, 'order_paid', 'Order paid', 'Order UBB-1793793569748-b807259a from Benedict ben aaa was paid for 500.00 GHS.', NULL, '2026-11-04 11:59:59', 'order-paid:UBB-1793793569748-b807259a:18'),
(23, 25, 'order_paid', 'Order paid', 'Order UBB-1793793569748-b807259a from Benedict ben aaa was paid for 500.00 GHS.', NULL, '2026-11-04 11:59:59', 'order-paid:UBB-1793793569748-b807259a:25'),
(24, 22, 'order_paid', 'Payment confirmed', 'Order UBB-1793834349728-014e6729 was paid successfully.', NULL, '2026-11-04 23:19:32', NULL),
(25, 22, 'license_created', 'License ready', '2 beat licenses is now available in your account.', NULL, '2026-11-04 23:19:32', NULL),
(26, 1, 'order_paid', 'Order paid', 'Order UBB-1793834349728-014e6729 from Benedict Amankwa was paid for 350.00 GHS.', NULL, '2026-11-04 23:19:32', 'order-paid:UBB-1793834349728-014e6729:1'),
(27, 18, 'order_paid', 'Order paid', 'Order UBB-1793834349728-014e6729 from Benedict Amankwa was paid for 350.00 GHS.', NULL, '2026-11-04 23:19:32', 'order-paid:UBB-1793834349728-014e6729:18'),
(28, 25, 'order_paid', 'Order paid', 'Order UBB-1793834349728-014e6729 from Benedict Amankwa was paid for 350.00 GHS.', NULL, '2026-11-04 23:19:32', 'order-paid:UBB-1793834349728-014e6729:25'),
(29, 22, 'order_paid', 'Payment confirmed', 'Order UBB-1793834879872-c727fe4d was paid successfully.', NULL, '2026-11-04 23:28:19', NULL),
(30, 1, 'order_paid', 'Order paid', 'Order UBB-1793834879872-c727fe4d from Benedict Amankwa was paid for 1000.00 GHS.', NULL, '2026-11-04 23:28:19', 'order-paid:UBB-1793834879872-c727fe4d:1'),
(31, 18, 'order_paid', 'Order paid', 'Order UBB-1793834879872-c727fe4d from Benedict Amankwa was paid for 1000.00 GHS.', NULL, '2026-11-04 23:28:19', 'order-paid:UBB-1793834879872-c727fe4d:18'),
(32, 25, 'order_paid', 'Order paid', 'Order UBB-1793834879872-c727fe4d from Benedict Amankwa was paid for 1000.00 GHS.', NULL, '2026-11-04 23:28:19', 'order-paid:UBB-1793834879872-c727fe4d:25'),
(33, 22, 'order_paid', 'Payment confirmed', 'Order UBB-1793834964895-c91e8b18 was paid successfully.', NULL, '2026-11-04 23:29:42', NULL),
(34, 22, 'license_created', 'License ready', '6 beat licenses is now available in your account.', NULL, '2026-11-04 23:29:42', NULL),
(35, 1, 'order_paid', 'Order paid', 'Order UBB-1793834964895-c91e8b18 from Benedict Amankwa was paid for 8540.00 GHS.', NULL, '2026-11-04 23:29:42', 'order-paid:UBB-1793834964895-c91e8b18:1'),
(36, 18, 'order_paid', 'Order paid', 'Order UBB-1793834964895-c91e8b18 from Benedict Amankwa was paid for 8540.00 GHS.', NULL, '2026-11-04 23:29:42', 'order-paid:UBB-1793834964895-c91e8b18:18'),
(37, 25, 'order_paid', 'Order paid', 'Order UBB-1793834964895-c91e8b18 from Benedict Amankwa was paid for 8540.00 GHS.', NULL, '2026-11-04 23:29:42', 'order-paid:UBB-1793834964895-c91e8b18:25'),
(38, 22, 'order_paid', 'Payment confirmed', 'Order UBB-1793930797365-14bb66dc was paid successfully.', NULL, '2026-11-06 02:06:56', NULL),
(39, 1, 'order_paid', 'Order paid', 'Order UBB-1793930797365-14bb66dc from Benedict Amankwa was paid for 100.00 GHS.', NULL, '2026-11-06 02:06:56', 'order-paid:UBB-1793930797365-14bb66dc:1'),
(40, 18, 'order_paid', 'Order paid', 'Order UBB-1793930797365-14bb66dc from Benedict Amankwa was paid for 100.00 GHS.', NULL, '2026-11-06 02:06:56', 'order-paid:UBB-1793930797365-14bb66dc:18'),
(41, 25, 'order_paid', 'Order paid', 'Order UBB-1793930797365-14bb66dc from Benedict Amankwa was paid for 100.00 GHS.', NULL, '2026-11-06 02:06:56', 'order-paid:UBB-1793930797365-14bb66dc:25'),
(42, 1, 'review_submitted', 'Review awaiting moderation', 'Benedict Amankwa submitted a 2-star review awaiting approval.', NULL, '2026-11-06 02:37:36', 'review-submitted:3:1'),
(43, 18, 'review_submitted', 'Review awaiting moderation', 'Benedict Amankwa submitted a 2-star review awaiting approval.', NULL, '2026-11-06 02:37:36', 'review-submitted:3:18'),
(44, 25, 'review_submitted', 'Review awaiting moderation', 'Benedict Amankwa submitted a 2-star review awaiting approval.', NULL, '2026-11-06 02:37:36', 'review-submitted:3:25');

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
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `orders`:
--

--
-- Truncate table before insert `orders`
--

TRUNCATE TABLE `orders`;
--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `reference`, `customer_name`, `customer_email`, `amount`, `currency`, `items_json`, `status`, `created_at`, `fulfillment_status`, `refunded_amount`, `refunded_at`) VALUES
(1, 'UBB-1793671736998-6b7f3ca7', 'John Doe', 'john.doe@example.com', 1000.00, 'GHS', '[{\"type\":\"booking\",\"name\":\"Full production\",\"service\":\"full-production\",\"songCount\":null,\"feeGhs\":1000,\"booking\":{\"name\":\"John Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"1234567890\",\"artistCount\":3,\"songCount\":null,\"sessionSlots\":[{\"date\":\"2026-11-03\",\"time\":\"11:00\"}],\"details\":\"none\"}}]', 'pending', '2026-11-03 02:08:57', 'unfulfilled', 0.00, NULL),
(2, 'UBB-1793671769627-21465962', 'John Doe', 'john.doe@example.com', 1000.00, 'GHS', '[{\"type\":\"booking\",\"name\":\"Full production\",\"service\":\"full-production\",\"songCount\":null,\"feeGhs\":1000,\"booking\":{\"name\":\"John Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"1234567890\",\"artistCount\":3,\"songCount\":null,\"sessionSlots\":[{\"date\":\"2026-11-03\",\"time\":\"11:00\"}],\"details\":\"none\"}}]', 'pending', '2026-11-03 02:09:29', 'unfulfilled', 0.00, NULL),
(3, 'UBB-1793671801452-7984f646', 'John Doe', 'john.doe@example.com', 1000.00, 'GHS', '[{\"type\":\"booking\",\"name\":\"Full production\",\"service\":\"full-production\",\"songCount\":null,\"feeGhs\":1000,\"booking\":{\"name\":\"John Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"1234567890\",\"artistCount\":3,\"songCount\":null,\"sessionSlots\":[{\"date\":\"2026-11-03\",\"time\":\"11:00\"}],\"details\":\"none\"}}]', 'pending', '2026-11-03 02:10:01', 'unfulfilled', 0.00, NULL),
(4, 'UBB-1793671824113-560cbe6c', 'John Doe', 'john.doe@example.com', 1000.00, 'GHS', '[{\"type\":\"booking\",\"name\":\"Full production\",\"service\":\"full-production\",\"songCount\":null,\"feeGhs\":1000,\"booking\":{\"name\":\"John Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"1234567890\",\"artistCount\":3,\"songCount\":null,\"sessionSlots\":[{\"date\":\"2026-11-03\",\"time\":\"11:00\"}],\"details\":\"none\"}}]', 'pending', '2026-11-03 02:10:24', 'unfulfilled', 0.00, NULL),
(5, 'UBB-1793771133212-bdb2ed7a', 'Benedict Amankwa', 'testappwithn3thunt3r@gmail.com', 250.00, 'GHS', '[{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25}]', 'paid', '2026-11-04 05:45:33', 'unfulfilled', 0.00, NULL),
(6, 'UBB-1793786660162-185a2677', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 700.00, 'GHS', '[{\"type\":\"booking\",\"name\":\"Mixtape\",\"service\":\"mixtape\",\"songCount\":null,\"feeGhs\":700,\"booking\":{\"name\":\"Benedict ben aaa\",\"email\":\"benedictamankwa18@gmail.com\",\"phone\":\"+233543779867\",\"artistCount\":2,\"songCount\":null,\"timezone\":\"Africa/Accra\",\"durationMinutes\":140,\"sessionSlots\":[{\"date\":\"2026-11-10\",\"time\":\"12:03\"}],\"details\":\"tukyluukjhgf\"}}]', 'paid', '2026-11-04 10:04:20', 'unfulfilled', 0.00, NULL),
(7, 'UBB-1793787137225-06f97a78', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 250.00, 'GHS', '[{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25}]', 'paid', '2026-11-04 10:12:17', 'unfulfilled', 0.00, NULL),
(8, 'UBB-1793793569748-b807259a', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 500.00, 'GHS', '[{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25},{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25}]', 'paid', '2026-11-04 11:59:29', 'unfulfilled', 0.00, NULL),
(9, 'UBB-1793834343331-9451075e', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 350.00, 'GHS', '[{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25},{\"type\":\"beat\",\"productId\":4,\"name\":\"ashghkl;,kj\",\"license\":\"basic\",\"priceUsd\":10}]', 'pending', '2026-11-04 23:19:03', 'unfulfilled', 0.00, NULL),
(10, 'UBB-1793834349728-014e6729', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 350.00, 'GHS', '[{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25},{\"type\":\"beat\",\"productId\":4,\"name\":\"ashghkl;,kj\",\"license\":\"basic\",\"priceUsd\":10}]', 'paid', '2026-11-04 23:19:09', 'unfulfilled', 0.00, NULL),
(11, 'UBB-1793834879872-c727fe4d', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 1000.00, 'GHS', '[{\"type\":\"beat\",\"productId\":4,\"name\":\"ashghkl;,kj\",\"license\":\"basic\",\"priceUsd\":10},{\"type\":\"beat\",\"productId\":3,\"name\":\"jjjj\",\"license\":\"basic\",\"priceUsd\":90}]', 'paid', '2026-11-04 23:27:59', 'unfulfilled', 0.00, NULL),
(12, 'UBB-1793834964895-c91e8b18', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 8540.00, 'GHS', '[{\"type\":\"beat\",\"productId\":2,\"name\":\"Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com)\",\"license\":\"basic\",\"priceUsd\":100},{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"basic\",\"priceUsd\":25},{\"type\":\"beat\",\"productId\":1,\"name\":\"New Beat\",\"license\":\"unlimited\",\"priceUsd\":150},{\"type\":\"beat\",\"productId\":2,\"name\":\"Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com)\",\"license\":\"unlimited\",\"priceUsd\":400},{\"type\":\"beat\",\"productId\":3,\"name\":\"jjjj\",\"license\":\"unlimited\",\"priceUsd\":99},{\"type\":\"beat\",\"productId\":4,\"name\":\"ashghkl;,kj\",\"license\":\"unlimited\",\"priceUsd\":80}]', 'paid', '2026-11-04 23:29:24', 'unfulfilled', 0.00, NULL),
(13, 'UBB-1793930797365-14bb66dc', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 100.00, 'GHS', '[{\"type\":\"merchandise\",\"productId\":1,\"name\":\"hoooo\",\"priceGhs\":100}]', 'paid', '2026-11-06 02:06:37', 'unfulfilled', 0.00, NULL);

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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `order_items`:
--   `order_id`
--       `orders` -> `id`
--

--
-- Truncate table before insert `order_items`
--

TRUNCATE TABLE `order_items`;
--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `product_type`, `product_id`, `product_name`, `license_type`, `unit_amount`, `currency`, `quantity`, `created_at`) VALUES
(1, 5, 'beat', 1, 'New Beat', 'basic', 250.00, 'GHS', 1, '2026-11-04 05:45:57'),
(2, 7, 'beat', 1, 'New Beat', 'basic', 250.00, 'GHS', 1, '2026-11-04 10:12:35'),
(3, 8, 'beat', 1, 'New Beat', 'basic', 250.00, 'GHS', 1, '2026-11-04 11:59:59'),
(4, 10, 'beat', 1, 'New Beat', 'basic', 250.00, 'GHS', 1, '2026-11-04 23:19:32'),
(5, 10, 'beat', 4, 'ashghkl;,kj', 'basic', 100.00, 'GHS', 1, '2026-11-04 23:19:32'),
(6, 11, 'beat', 4, 'ashghkl;,kj', 'basic', 100.00, 'GHS', 1, '2026-11-04 23:28:19'),
(7, 11, 'beat', 3, 'jjjj', 'basic', 900.00, 'GHS', 1, '2026-11-04 23:28:19'),
(8, 12, 'beat', 2, 'Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com)', 'basic', 1000.00, 'GHS', 1, '2026-11-04 23:29:42'),
(9, 12, 'beat', 1, 'New Beat', 'basic', 250.00, 'GHS', 1, '2026-11-04 23:29:42'),
(10, 12, 'beat', 1, 'New Beat', 'unlimited', 1500.00, 'GHS', 1, '2026-11-04 23:29:42'),
(11, 12, 'beat', 2, 'Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com)', 'unlimited', 4000.00, 'GHS', 1, '2026-11-04 23:29:42'),
(12, 12, 'beat', 3, 'jjjj', 'unlimited', 990.00, 'GHS', 1, '2026-11-04 23:29:42'),
(13, 12, 'beat', 4, 'ashghkl;,kj', 'unlimited', 800.00, 'GHS', 1, '2026-11-04 23:29:42'),
(14, 13, 'merchandise', 1, 'hoooo', NULL, 100.00, 'GHS', 1, '2026-11-06 02:06:56');

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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `payments`:
--   `order_id`
--       `orders` -> `id`
--

--
-- Truncate table before insert `payments`
--

TRUNCATE TABLE `payments`;
--
-- Dumping data for table `payments`
--

INSERT INTO `payments` (`id`, `order_id`, `provider`, `provider_reference`, `status`, `amount`, `currency`, `provider_payload`, `verified_at`, `created_at`, `updated_at`) VALUES
(1, 5, 'paystack', 'UBB-1793771133212-bdb2ed7a', 'paid', 250.00, 'GHS', '{\"id\":6727914649,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793771133212-bdb2ed7a\",\"receipt_number\":\"10101\",\"amount\":25000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-04T05:45:48.000Z\",\"created_at\":\"2026-11-04T05:45:34.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.204.44.65\",\"metadata\":\"\",\"log\":{\"start_time\":1793771141,\"time_spent\":6,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":6}]},\"fees\":488,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_qozwfg4xi7\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\"},\"customer\":{\"id\":414205866,\"first_name\":null,\"last_name\":null,\"email\":\"testappwithn3thunt3r@gmail.com\",\"customer_code\":\"CUS_inu1h8yjda1brhw\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T05:45:48.000Z\",\"createdAt\":\"2026-11-04T05:45:34.000Z\",\"requested_amount\":25000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T05:45:34.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 05:45:57', '2026-11-04 05:45:34', '2026-11-04 05:45:57'),
(3, 6, 'paystack', 'UBB-1793786660162-185a2677', 'paid', 700.00, 'GHS', '{\"id\":6728688927,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793786660162-185a2677\",\"receipt_number\":\"10101\",\"amount\":70000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-04T10:04:32.000Z\",\"created_at\":\"2026-11-04T10:04:21.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.204.44.65\",\"metadata\":{\"referrer\":\"http://localhost:5500/\"},\"log\":{\"start_time\":1793786669,\"time_spent\":3,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":3}]},\"fees\":1365,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_0uvtk9xik0\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\",\"receiver_bank_account_number\":null,\"receiver_bank\":null},\"customer\":{\"id\":393473926,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa18@gmail.com\",\"customer_code\":\"CUS_civ9fntp2uv4nqt\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T10:04:32.000Z\",\"createdAt\":\"2026-11-04T10:04:21.000Z\",\"requested_amount\":70000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T10:04:21.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 10:04:41', '2026-11-04 10:04:21', '2026-11-04 10:04:41'),
(5, 7, 'paystack', 'UBB-1793787137225-06f97a78', 'paid', 250.00, 'GHS', '{\"id\":6728718680,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793787137225-06f97a78\",\"receipt_number\":\"10101\",\"amount\":25000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-04T10:12:28.000Z\",\"created_at\":\"2026-11-04T10:12:18.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.204.44.65\",\"metadata\":{\"referrer\":\"http://localhost:5500/\"},\"log\":{\"start_time\":1793787144,\"time_spent\":4,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":4}]},\"fees\":488,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_a5udo2w4mm\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\",\"receiver_bank_account_number\":null,\"receiver_bank\":null},\"customer\":{\"id\":393473926,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa18@gmail.com\",\"customer_code\":\"CUS_civ9fntp2uv4nqt\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T10:12:28.000Z\",\"createdAt\":\"2026-11-04T10:12:18.000Z\",\"requested_amount\":25000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T10:12:18.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 10:12:35', '2026-11-04 10:12:18', '2026-11-04 10:12:35'),
(7, 8, 'paystack', 'UBB-1793793569748-b807259a', 'paid', 500.00, 'GHS', '{\"id\":6729092919,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793793569748-b807259a\",\"receipt_number\":null,\"amount\":50000,\"message\":null,\"gateway_response\":\"Successful\",\"gateway_response_code\":\"approved\",\"response_code\":\"00\",\"paid_at\":\"2026-11-04T11:59:54.000Z\",\"created_at\":\"2026-11-04T11:59:30.000Z\",\"channel\":\"card\",\"currency\":\"GHS\",\"ip_address\":\"41.204.44.65\",\"metadata\":\"\",\"log\":{\"start_time\":1793793582,\"time_spent\":13,\"attempts\":1,\"errors\":0,\"success\":true,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with card\",\"time\":12},{\"type\":\"success\",\"message\":\"Successfully paid with card\",\"time\":13}]},\"fees\":975,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_c0una37v6m\",\"bin\":\"408408\",\"last4\":\"4081\",\"exp_month\":\"12\",\"exp_year\":\"2030\",\"channel\":\"card\",\"card_type\":\"visa \",\"bank\":\"TEST BANK\",\"country_code\":\"GH\",\"brand\":\"visa\",\"reusable\":true,\"signature\":\"SIG_dSvV7rRHocB17yQkXUoE\",\"account_name\":null},\"customer\":{\"id\":393473926,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa18@gmail.com\",\"customer_code\":\"CUS_civ9fntp2uv4nqt\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T11:59:54.000Z\",\"createdAt\":\"2026-11-04T11:59:30.000Z\",\"requested_amount\":50000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T11:59:30.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 11:59:59', '2026-11-04 11:59:31', '2026-11-04 11:59:59'),
(9, 10, 'paystack', 'UBB-1793834349728-014e6729', 'paid', 350.00, 'GHS', '{\"id\":6731052082,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793834349728-014e6729\",\"receipt_number\":null,\"amount\":35000,\"message\":\"test-3ds\",\"gateway_response\":\"[Test] Approved\",\"gateway_response_code\":null,\"response_code\":null,\"paid_at\":\"2026-11-04T23:19:28.000Z\",\"created_at\":\"2026-11-04T23:19:10.000Z\",\"channel\":\"card\",\"currency\":\"GHS\",\"ip_address\":\"41.66.202.221\",\"metadata\":\"\",\"log\":{\"start_time\":1793834357,\"time_spent\":12,\"attempts\":1,\"errors\":0,\"success\":true,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with card\",\"time\":7},{\"type\":\"auth\",\"message\":\"Authentication Required: 3DS\",\"time\":7},{\"type\":\"action\",\"message\":\"Third-party authentication window opened\",\"time\":10},{\"type\":\"success\",\"message\":\"Successfully paid with card\",\"time\":12}]},\"fees\":683,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_2ma78kinpu\",\"bin\":\"408408\",\"last4\":\"0409\",\"exp_month\":\"01\",\"exp_year\":\"2030\",\"channel\":\"card\",\"card_type\":\"visa \",\"bank\":\"TEST BANK\",\"country_code\":\"GH\",\"brand\":\"visa\",\"reusable\":true,\"signature\":\"SIG_Un7YGpyBvPxrC9xO22Uo\",\"account_name\":null},\"customer\":{\"id\":393451060,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa9@gmail.com\",\"customer_code\":\"CUS_j3ezjgddv4j5754\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T23:19:28.000Z\",\"createdAt\":\"2026-11-04T23:19:10.000Z\",\"requested_amount\":35000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T23:19:10.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 23:19:32', '2026-11-04 23:19:10', '2026-11-04 23:19:32'),
(11, 11, 'paystack', 'UBB-1793834879872-c727fe4d', 'paid', 1000.00, 'GHS', '{\"id\":6731059323,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793834879872-c727fe4d\",\"receipt_number\":\"10101\",\"amount\":100000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-04T23:28:09.000Z\",\"created_at\":\"2026-11-04T23:28:00.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.66.202.221\",\"metadata\":{\"referrer\":\"http://localhost:5500/\"},\"log\":{\"start_time\":1793834886,\"time_spent\":4,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":4}]},\"fees\":1950,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_nru9e6uc44\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\",\"receiver_bank_account_number\":null,\"receiver_bank\":null},\"customer\":{\"id\":393451060,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa9@gmail.com\",\"customer_code\":\"CUS_j3ezjgddv4j5754\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T23:28:09.000Z\",\"createdAt\":\"2026-11-04T23:28:00.000Z\",\"requested_amount\":100000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T23:28:00.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 23:28:19', '2026-11-04 23:28:01', '2026-11-04 23:28:19'),
(13, 12, 'paystack', 'UBB-1793834964895-c91e8b18', 'paid', 8540.00, 'GHS', '{\"id\":6731060428,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793834964895-c91e8b18\",\"receipt_number\":\"10101\",\"amount\":854000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-04T23:29:32.000Z\",\"created_at\":\"2026-11-04T23:29:25.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.66.202.221\",\"metadata\":{\"referrer\":\"http://localhost:5500/\"},\"log\":{\"start_time\":1793834970,\"time_spent\":3,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":3}]},\"fees\":16653,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_fpgtaegbe9\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\",\"receiver_bank_account_number\":null,\"receiver_bank\":null},\"customer\":{\"id\":393451060,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa9@gmail.com\",\"customer_code\":\"CUS_j3ezjgddv4j5754\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-04T23:29:32.000Z\",\"createdAt\":\"2026-11-04T23:29:25.000Z\",\"requested_amount\":854000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-04T23:29:25.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-04 23:29:42', '2026-11-04 23:29:25', '2026-11-04 23:29:42'),
(15, 13, 'paystack', 'UBB-1793930797365-14bb66dc', 'paid', 100.00, 'GHS', '{\"id\":6734819316,\"domain\":\"test\",\"status\":\"success\",\"reference\":\"UBB-1793930797365-14bb66dc\",\"receipt_number\":\"10101\",\"amount\":10000,\"message\":null,\"gateway_response\":\"Approved\",\"paid_at\":\"2026-11-06T02:06:46.000Z\",\"created_at\":\"2026-11-06T02:06:38.000Z\",\"channel\":\"mobile_money\",\"currency\":\"GHS\",\"ip_address\":\"41.66.202.242\",\"metadata\":\"\",\"log\":{\"start_time\":1793930804,\"time_spent\":2,\"attempts\":1,\"errors\":0,\"success\":false,\"mobile\":false,\"input\":[],\"history\":[{\"type\":\"action\",\"message\":\"Attempted to pay with mobile money\",\"time\":2}]},\"fees\":195,\"fees_split\":null,\"authorization\":{\"authorization_code\":\"AUTH_2xg99umyhb\",\"bin\":\"055XXX\",\"last4\":\"X987\",\"exp_month\":\"12\",\"exp_year\":\"9999\",\"channel\":\"mobile_money\",\"card_type\":\"\",\"bank\":\"MTN\",\"country_code\":\"GH\",\"brand\":\"Mtn\",\"reusable\":false,\"signature\":null,\"account_name\":null,\"mobile_money_number\":\"0551234987\"},\"customer\":{\"id\":393451060,\"first_name\":null,\"last_name\":null,\"email\":\"benedictamankwa9@gmail.com\",\"customer_code\":\"CUS_j3ezjgddv4j5754\",\"phone\":null,\"metadata\":null,\"risk_action\":\"default\",\"international_format_phone\":null},\"plan\":null,\"split\":{},\"order_id\":null,\"paidAt\":\"2026-11-06T02:06:46.000Z\",\"createdAt\":\"2026-11-06T02:06:38.000Z\",\"requested_amount\":10000,\"pos_transaction_data\":null,\"source\":null,\"fees_breakdown\":null,\"connect\":null,\"transaction_date\":\"2026-11-06T02:06:38.000Z\",\"plan_object\":{},\"subaccount\":{}}', '2026-11-06 02:06:56', '2026-11-06 02:06:38', '2026-11-06 02:06:56');

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
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `sales`:
--

--
-- Truncate table before insert `sales`
--

TRUNCATE TABLE `sales`;
--
-- Dumping data for table `sales`
--

INSERT INTO `sales` (`id`, `sale_type`, `product_id`, `product_name`, `buyer_name`, `buyer_email`, `amount`, `created_at`, `order_reference`, `line_index`) VALUES
(4, 'beat', 1, 'New Beat (basic)', 'Benedict Amankwa', 'testappwithn3thunt3r@gmail.com', 250.00, '2026-11-04 05:45:57', 'UBB-1793771133212-bdb2ed7a', 0),
(5, 'booking', NULL, 'Mixtape', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 700.00, '2026-11-04 10:04:41', 'UBB-1793786660162-185a2677', 0),
(6, 'beat', 1, 'New Beat (basic)', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 250.00, '2026-11-04 10:12:35', 'UBB-1793787137225-06f97a78', 0),
(7, 'beat', 1, 'New Beat (basic)', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 250.00, '2026-11-04 11:59:59', 'UBB-1793793569748-b807259a', 0),
(8, 'beat', 1, 'New Beat (basic)', 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 250.00, '2026-11-04 11:59:59', 'UBB-1793793569748-b807259a', 1),
(9, 'beat', 1, 'New Beat (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 250.00, '2026-11-04 23:19:32', 'UBB-1793834349728-014e6729', 0),
(10, 'beat', 4, 'ashghkl;,kj (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 100.00, '2026-11-04 23:19:32', 'UBB-1793834349728-014e6729', 1),
(11, 'beat', 4, 'ashghkl;,kj (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 100.00, '2026-11-04 23:28:19', 'UBB-1793834879872-c727fe4d', 0),
(12, 'beat', 3, 'jjjj (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 900.00, '2026-11-04 23:28:19', 'UBB-1793834879872-c727fe4d', 1),
(13, 'beat', 2, 'Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com) (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 1000.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 0),
(14, 'beat', 1, 'New Beat (basic)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 250.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 1),
(15, 'beat', 1, 'New Beat (unlimited)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 1500.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 2),
(16, 'beat', 2, 'Tauren-Wells-What-A-Miracle-Feels-Like-(CeeNaija.com) (unlimited)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 4000.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 3),
(17, 'beat', 3, 'jjjj (unlimited)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 990.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 4),
(18, 'beat', 4, 'ashghkl;,kj (unlimited)', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 800.00, '2026-11-04 23:29:42', 'UBB-1793834964895-c91e8b18', 5),
(19, 'merchandise', 1, 'hoooo', 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 100.00, '2026-11-06 02:06:56', 'UBB-1793930797365-14bb66dc', 0);

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
--
-- Dumping data for table `schema_migrations`
--

INSERT INTO `schema_migrations` (`version`, `applied_at`) VALUES
(0, '2026-11-04 03:42:48'),
(1, '2026-11-03 03:07:48'),
(2, '2026-11-03 03:16:17'),
(3, '2026-11-03 07:22:21'),
(4, '2026-11-03 07:26:06'),
(5, '2026-11-03 10:18:04'),
(6, '2026-11-03 10:21:46'),
(7, '2026-11-03 10:29:51'),
(8, '2026-11-03 10:31:33'),
(9, '2026-11-03 10:42:55'),
(10, '2026-11-03 10:43:46'),
(11, '2026-11-03 18:40:33'),
(12, '2026-11-03 18:53:52'),
(13, '2026-11-03 19:06:06'),
(14, '2026-11-03 19:49:48'),
(15, '2026-11-03 20:54:52'),
(16, '2026-11-03 21:38:59'),
(17, '2026-11-04 03:13:05'),
(18, '2026-11-04 03:34:25'),
(19, '2026-11-04 03:42:50'),
(20, '2026-11-04 04:17:10'),
(21, '2026-11-04 11:16:20'),
(22, '2026-11-04 11:40:06'),
(23, '2026-11-05 00:26:08'),
(24, '2026-11-05 21:05:47'),
(25, '2026-11-06 02:13:43'),
(26, '2026-11-06 02:26:45');

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
-- Last update: Nov 04, 2026 at 09:56 PM
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
(1, '86yttt8 7y7y76677', 'derryakyene99@gmail.com', '86yttt8', '7y7y76677', 'g6g87g87g8', '+23368986878', 'admin', NULL, 'd93cd34f6fb827e9f41cc6a9cce49f0d:e680a5b15478f2584dc31ed296869fc6ef71989787fbd42d1e9594b2dbd5fd8c12e9abb9b5b2dd019d40be238029ef2f42b5d468234f7144a9334045e4dbc7aa', '2026-08-22 20:49:51', NULL),
(2, 'John Doe', 'test@example.com', 'John', 'Doe', NULL, '1234567890', 'non_artist', '123 Main St', '17acacee2ee3437bd701dafeb3d8f83c:84b07b74ae436dd502152962ba1fbe2af5267338110f33310b0d4b5999db2065a440a097abb185855cd9db0c41b23c2dad6ecce1ba4267de28b9c88ec1fbbb29', '2026-11-02 23:45:16', NULL),
(5, 'John Doe', 'test1s@example.com', 'John', 'Doe', 'test100', '1034567890', 'non_artist', '123 Main St', '06216840bcc91b70274e9935c65223cd:aaa7a48d5357aec2d9b12562a2d44a12eeb79398f7816312500999b85851f2eea04da84bd79498c84b344a5073423adc495c5c6f5f2e12f3483759d808a6c6db', '2026-11-02 23:51:54', NULL),
(13, 'John Doe', 'test1sss@example.com', 'John', 'Doe', NULL, '10345ss67890', 'non_artist', '123 Main St', '84f0436bd87d46aecb1283a6c904600a:a0af590ea76137b6e6ec517d669bf8afabb8fdb77405f95efd128516fcac2268e37c1c45df23a47080ead50cf26b814c7f19218c3602c24798c1616dc9038c3f', '2026-11-03 00:03:21', NULL),
(16, 'John Doe', 'tes99t1s@example.com', 'John', 'Doe', NULL, '987654355', 'non_artist', '123 Main St', '084e9e504e947e71438d755757e74a3e:8dfe6d74529a05c6f9c57dfeaca8d267ca3d60e451cdfbd3b2de429203465e3e05915b5aa80058c326607a4785d68baa3a024be92ab5de47483289aecb785058', '2026-11-03 00:22:28', NULL),
(18, 'John Doe', 'admin12@example.com', 'John', 'Doe', NULL, '88886667', 'admin', '123 Main St', '572fe3d729eddf98745e3229bff1f06d:c18cad103f7b5f7ace731eeb0a2eab5c011b724c0e1eb1b8ef7452146c29881e58bca7826afc93009766c0c4ae7d4a9191fdc5fca8d9c06b046955c2c3ffae83', '2026-11-03 02:31:44', NULL),
(21, 'Benedict Amankwa', 'testappwithn3thunt3r@gmail.com', 'Benedict', 'Amankwa', 'Bene', '+233543779868', 'artist', NULL, 'scrypt$32768$8$1$7d1003e46f93b080f0ff09b5bffd3331$8b7964ab527dcde00aed7aa15ca21738ef78970048a49f1c01a9a202f3dae4ca56075dfce638fa5ee0752cf17b26565d7d7f3c9e19e5fc35609fd4a937a91ea4', '2026-11-04 04:58:07', NULL),
(22, 'Benedict Amankwa', 'benedictamankwa9@gmail.com', 'Benedict', 'Amankwa', 'Bene', '+233594500785', 'artist', NULL, 'scrypt$32768$8$1$1252752c5c00e748129317af8a9e3063$fb9e5668cd5fd19649ed00dfd831adb017767e6d62605a4de8cd72f08f7d0810b5272ba19a86362c5f0c6da760fde5c90e7c12fe3a47f5130ff53e5b76d4b813', '2026-11-04 05:47:58', '2026-11-04 21:56:25'),
(24, 'Benedict ben aaa', 'benedictamankwa18@gmail.com', 'Benedict', 'ben aaa', 'Bene', '+233543779867', 'artist', NULL, 'scrypt$32768$8$1$86e36f10bef03f02171a09d8f5801838$f68b665cc74144d568ff636e51d49db6d3a91439d0e18b66e443e0701bd8c3a3d3d6499e32fa54a078611e9ee45469c6ebb109ffa659fa8131230628b56a5380', '2026-11-04 08:06:12', '2026-11-04 08:08:59'),
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
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `user_sessions`:
--   `user_id`
--       `users` -> `id`
--

--
-- Truncate table before insert `user_sessions`
--

TRUNCATE TABLE `user_sessions`;
--
-- Dumping data for table `user_sessions`
--

INSERT INTO `user_sessions` (`id`, `user_id`, `token_hash`, `role`, `expires_at`, `created_at`, `last_used_at`, `csrf_token_hash`) VALUES
(2, 21, 'f50a811effd3f993deb443d94f76378d17136429902d0252168d31c9763ef7dd', 'artist', '2026-11-04 12:59:48', '2026-11-04 04:59:48', '2026-11-04 05:04:15', NULL),
(3, 22, '92031ab8e28bce59e760f44d695b11fbaeed3349d0fe851a08f77b9d26fb21d4', 'artist', '2026-11-04 13:50:43', '2026-11-04 05:50:43', '2026-11-04 05:51:12', NULL),
(9, 25, 'af0968dee7bfc5f31e4b47c60d0d2f1b06761a767c3b2e04d03c8628a6c74003', 'super_admin', '2026-11-04 18:39:29', '2026-11-04 10:39:29', '2026-11-04 11:56:12', NULL),
(12, 24, '6da1a1e13f30eb1f77f2cc6ebe83e624599a171b64b34fe1b2223997b2f24ccc', 'artist', '2026-11-04 19:58:34', '2026-11-04 11:58:34', '2026-11-04 12:00:03', NULL),
(14, 22, 'cc7e2d4cf0b51c09b26514b38848709603281b29f0c89b27c0fce695f29177d8', 'artist', '2026-11-05 05:58:20', '2026-11-04 21:58:20', '2026-11-05 01:00:43', NULL),
(15, 25, '15eb974a47aad4612eafb5a5ca8fcbd2612c38b67cac3afbb7fc6a7c6c46fba6', 'super_admin', '2026-11-05 06:03:45', '2026-11-04 22:03:45', '2026-11-05 00:59:07', NULL),
(16, 25, '6419625ff0aaecbd83a16f190343ad440d4365a29b89e61adaa4df9ab46ae247', 'super_admin', '2026-11-06 05:48:38', '2026-11-05 21:48:38', '2026-11-06 03:12:22', 'fe1a0831615dc7ac0e701e566ebc90dada2c6c4426d57e4b202f964952bbeaf5'),
(17, 22, '29e141fcf78d0713acc6a7ae958d01c1a280df69f3ab9760fba6517e59b0e8e5', 'artist', '2026-11-06 09:48:35', '2026-11-06 01:48:35', '2026-11-06 02:40:18', '811ea714a660d20f8ccafbad417a9037d0cba171a4a33d39642d1628ead07301');

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
-- Dumping data for table `withdrawals`
--

INSERT INTO `withdrawals` (`id`, `amount`, `created_at`) VALUES
(1, 988.00, '2026-11-03 01:23:18'),
(2, 988.00, '2026-11-03 01:24:07');

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
