<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Konfigurace připojení k databázi
$host    = '127.0.0.1';
$port    = '3306';
$db      = 'rosendov';
$user    = 'rosendov';
$pass    = 'Kr@ken-29.05.2003';
$charset = 'utf8mb4';

$dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";

try {
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['chyba' => 'Nepodařilo se připojit k databázi: ' . $e->getMessage()]);
    exit;
}

$uzivatelId = 1;
$metoda = $_SERVER['REQUEST_METHOD'];

// 1. GET: Načtení profilu, stavů odborek a stavů úkolů
if ($metoda === 'GET') {
    $stmtUser = $pdo->prepare("SELECT id, prezdivka, vekova_kategorie FROM uzivatele WHERE id = ?");
    $stmtUser->execute([$uzivatelId]);
    $uzivatel = $stmtUser->fetch();

    if (!$uzivatel) {
        http_response_code(404);
        echo json_encode(['chyba' => 'Uživatel nenalezen']);
        exit;
    }

    $stmtStavy = $pdo->prepare("SELECT odborka_id, stav FROM odborky_uzivatele WHERE uzivatel_id = ?");
    $stmtStavy->execute([$uzivatelId]);
    $stavyOdborek = [];
    foreach ($stmtStavy->fetchAll() as $radek) {
        $stavyOdborek[$radek['odborka_id']] = $radek['stav'];
    }

    // Načteme úkoly včetně jejich stavu ('chci_plnit' nebo 'splneno')
    $stmtUkoly = $pdo->prepare("SELECT odborka_id, ukol_id, stav FROM splnene_ukoly WHERE uzivatel_id = ?");
    $stmtUkoly->execute([$uzivatelId]);
    $splneneUkoly = $stmtUkoly->fetchAll();

    echo json_encode([
        'uzivatel' => $uzivatel,
        'stavy_odborek' => $stavyOdborek,
        'splnene_ukoly' => $splneneUkoly
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. POST: Ukládání změn
if ($metoda === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $akce = $data['akce'] ?? '';

    // A) Nastavení stavu úkolu (plánováno / splněno / smazáno)
    if ($akce === 'prepnout_ukol') {
        $odborkaId = $data['odborka_id'] ?? null;
        $ukolId = $data['ukol_id'] ?? null;
        $stav = $data['stav'] ?? null; // 'chci_plnit', 'splneno', nebo null (pokud se odklikne)

        if (!$odborkaId || !$ukolId) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Chybí ID odborky nebo úkolu']);
            exit;
        }

        if ($stav && in_array($stav, ['chci_plnit', 'splneno'])) {
            $stmt = $pdo->prepare("INSERT INTO splnene_ukoly (uzivatel_id, odborka_id, ukol_id, stav) 
                                   VALUES (?, ?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE stav = VALUES(stav)");
            $stmt->execute([$uzivatelId, $odborkaId, $ukolId, $stav]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM splnene_ukoly WHERE uzivatel_id = ? AND odborka_id = ? AND ukol_id = ?");
            $stmt->execute([$uzivatelId, $odborkaId, $ukolId]);
        }

        echo json_encode(['uspech' => true]);
        exit;
    }

    // B) Změna stavu celé odborky
    if ($akce === 'nastavit_stav_odborky') {
        $odborkaId = $data['odborka_id'] ?? null;
        $stav = $data['stav'] ?? null;

        if (!$odborkaId) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Chybí ID odborky']);
            exit;
        }

        if ($stav && in_array($stav, ['chci_plnit', 'plnim', 'splneno'])) {
            $stmt = $pdo->prepare("INSERT INTO odborky_uzivatele (uzivatel_id, odborka_id, stav) 
                                   VALUES (?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE stav = VALUES(stav)");
            $stmt->execute([$uzivatelId, $odborkaId, $stav]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM odborky_uzivatele WHERE uzivatel_id = ? AND odborka_id = ?");
            $stmt->execute([$uzivatelId, $odborkaId]);
        }

        echo json_encode(['uspech' => true]);
        exit;
    }

    // C) Změna věkové kategorie uživatele
    if ($akce === 'zmenit_kategorii') {
        $kategorie = $data['vekova_kategorie'] ?? '';

        if (!in_array($kategorie, ['mladsi_skauti', 'starsi_skauti', 'roveri'])) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Neplatná věková kategorie']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE uzivatele SET vekova_kategorie = ? WHERE id = ?");
        $stmt->execute([$kategorie, $uzivatelId]);

        echo json_encode(['uspech' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['chyba' => 'Neznámá akce']);
    exit;
}