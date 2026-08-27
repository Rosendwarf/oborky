<?php
// Vynucení parametrů session cookie pro localhost před samotným startem session
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Konfigurace připojení k databázi
$host    = '127.0.0.1';
$port    = '6606';
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

$input = json_decode(file_get_contents('php://input'), true);
$metoda = $_SERVER['REQUEST_METHOD'];

// 1. Zpracování akcí, které NEVYŽADUJÍ přihlášení
if ($metoda === 'POST' && isset($input['akce'])) {
    $akce = $input['akce'];

    if ($akce === 'registrovat') {
        $prezdivka = trim($input['prezdivka'] ?? '');
        $heslo = $input['heslo'] ?? '';
        $vekova_kategorie = $input['vekova_kategorie'] ?? 'starsi_skauti';

        if (empty($prezdivka) || empty($heslo)) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Vyplňte přezdívku a heslo.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT id FROM uzivatele WHERE prezdivka = ?");
        $stmt->execute([$prezdivka]);
        if ($stmt->fetch()) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Tato přezdívka je již obsazená.']);
            exit;
        }

        $hash = password_hash($heslo, PASSWORD_DEFAULT);

        $stmt = $pdo->prepare("INSERT INTO uzivatele (prezdivka, heslo, vekova_kategorie) VALUES (?, ?, ?)");
        $stmt->execute([$prezdivka, $hash, $vekova_kategorie]);
        
        $_SESSION['uzivatel_id'] = $pdo->lastInsertId();
        session_write_close();
        echo json_encode(['uspech' => true]);
        exit;
    }

    if ($akce === 'prihlasit') {
        $prezdivka = trim($input['prezdivka'] ?? '');
        $heslo = $input['heslo'] ?? '';

        $stmt = $pdo->prepare("SELECT * FROM uzivatele WHERE prezdivka = ?");
        $stmt->execute([$prezdivka]);
        $user = $stmt->fetch();

        if ($user && password_verify($heslo, $user['heslo'])) {
            $_SESSION['uzivatel_id'] = $user['id'];
            session_write_close();
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(401);
            echo json_encode(['chyba' => 'Neplatná přezdívka nebo heslo.']);
        }
        exit;
    }

    if ($akce === 'odhlasit') {
        unset($_SESSION['uzivatel_id']);
        session_destroy();
        echo json_encode(['uspech' => true]);
        exit;
    }
}

// 2. KONTROLA PŘIHLÁŠENÍ – Zde už musí mít uživatel aktivní session
if (!isset($_SESSION['uzivatel_id'])) {
    http_response_code(401);
    echo json_encode(['chyba' => 'Nejste přihlášen.']);
    exit;
}

$uzivatelId = $_SESSION['uzivatel_id'];

// 3. GET: Načtení profilu
if ($metoda === 'GET') {
    $stmtUser = $pdo->prepare("SELECT id, prezdivka, vekova_kategorie FROM uzivatele WHERE id = ?");
    $stmtUser->execute([$uzivatelId]);
    $uzivatel = $stmtUser->fetch();

    if (!$uzivatel) {
        unset($_SESSION['uzivatel_id']);
        http_response_code(401);
        echo json_encode(['chyba' => 'Uživatel nenalezen']);
        exit;
    }

    $stmtStavy = $pdo->prepare("SELECT odborka_id, stav FROM odborky_uzivatele WHERE uzivatel_id = ?");
    $stmtStavy->execute([$uzivatelId]);
    $stavyOdborek = [];
    foreach ($stmtStavy->fetchAll() as $radek) {
        $stavyOdborek[$radek['odborka_id']] = $radek['stav'];
    }

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

// 4. POST: Ukládání změn do DB
if ($metoda === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $akce = $data['akce'] ?? '';

    if ($akce === 'prepnout_ukol') {
        $odborkaId = $data['odborka_id'] ?? null;
        $ukolId = $data['ukol_id'] ?? null;
        $stav = $data['stav'] ?? null;

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

    if ($akce === 'zmenit_heslo') {
        $stare_heslo = $data['stare_heslo'] ?? '';
        $nove_heslo = $data['nove_heslo'] ?? '';

        if (empty($stare_heslo) || empty($nove_heslo)) {
            http_response_code(400);
            echo json_encode(['chyba' => 'Vyplňte obě hesla.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT heslo FROM uzivatele WHERE id = ?");
        $stmt->execute([$uzivatelId]);
        $user = $stmt->fetch();

        if ($user && password_verify($stare_heslo, $user['heslo'])) {
            $hash = password_hash($nove_heslo, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE uzivatele SET heslo = ? WHERE id = ?");
            $stmt->execute([$hash, $uzivatelId]);
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['chyba' => 'Staré heslo není správné.']);
        }
        exit;
    }

    http_response_code(400);
    echo json_encode(['chyba' => 'Neznámá akce']);
    exit;
}