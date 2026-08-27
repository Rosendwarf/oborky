<?php
/**
 * Produkční API Endpoint - Skautské odborky
 */

// Vypnutí zobrazování chyb uživateli (bezpečnost na produkci)
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// Session nastavení pro produkční prostředí
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'domain'   => '',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
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
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false
    ]);
} catch (PDOException $e) {
    error_log("DB Connection error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['chyba' => 'Došlo k chybě na straně serveru. Zkuste to prosím později.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$metoda = $_SERVER['REQUEST_METHOD'];

// =========================================
// 1. VEŘEJNÉ AKCE (nevyžadují přihlášení)
// =========================================
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

// =========================================
// 2. KONTROLA PŘIHLÁŠENÍ PRO PRIVÁTNÍ AKCE
// =========================================
if (!isset($_SESSION['uzivatel_id'])) {
    http_response_code(401);
    echo json_encode(['chyba' => 'Nejste přihlášen.']);
    exit;
}
$uzivatelId = $_SESSION['uzivatel_id'];

// =========================================
// 3. GET: Načtení dat
// =========================================
if ($metoda === 'GET') {
    $akce = $_GET['akce'] ?? 'profil';

    if ($akce === 'profil') {
        $stmtUser = $pdo->prepare("SELECT id, prezdivka, vekova_kategorie FROM uzivatele WHERE id = ?");
        $stmtUser->execute([$uzivatelId]);
        $uzivatel = $stmtUser->fetch();

        if (!$uzivatel) {
            unset($_SESSION['uzivatel_id']);
            http_response_code(401);
            echo json_encode(['chyba' => 'Uživatel nenalezen.']);
            exit;
        }

        $stmtStavy = $pdo->prepare("SELECT odborka_id, stav, v_seznamu_prani FROM odborky_uzivatele WHERE uzivatel_id = ?");
        $stmtStavy->execute([$uzivatelId]);
        $stavyOdborek = [];
        $wishlist = [];
        foreach ($stmtStavy->fetchAll() as $radek) {
            if ($radek['stav']) {
                $stavyOdborek[$radek['odborka_id']] = $radek['stav'];
            }
            if ($radek['v_seznamu_prani']) {
                $wishlist[] = $radek['odborka_id'];
            }
        }

        $stmtUkoly = $pdo->prepare("SELECT odborka_id, ukol_id, stav FROM splnene_ukoly WHERE uzivatel_id = ?");
        $stmtUkoly->execute([$uzivatelId]);
        $splneneUkoly = $stmtUkoly->fetchAll();

        $stmtSkupina = $pdo->prepare("SELECT s.id, s.nazev FROM skupiny s JOIN clenove_skupiny cs ON s.id = cs.skupina_id WHERE cs.uzivatel_id = ? LIMIT 1");
        $stmtSkupina->execute([$uzivatelId]);
        $skupina = $stmtSkupina->fetch();

        echo json_encode([
            'uzivatel' => $uzivatel,
            'stavy_odborek' => $stavyOdborek,
            'wishlist' => $wishlist,
            'splnene_ukoly' => $splneneUkoly,
            'skupina' => $skupina
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($akce === 'skupina_data') {
        $stmt = $pdo->prepare("SELECT s.*, cs.role FROM skupiny s JOIN clenove_skupiny cs ON s.id = cs.skupina_id WHERE cs.uzivatel_id = ? LIMIT 1");
        $stmt->execute([$uzivatelId]);
        $skupina = $stmt->fetch();

        if (!$skupina) {
            http_response_code(403);
            echo json_encode(['chyba' => 'Nejste členem žádné skupiny.']);
            exit;
        }

        $jeAdmin = ($skupina['role'] === 'admin');

        $stmt = $pdo->prepare("SELECT u.id, u.prezdivka, cs.role FROM uzivatele u JOIN clenove_skupiny cs ON u.id = cs.uzivatel_id WHERE cs.skupina_id = ? ORDER BY cs.role ASC, u.prezdivka ASC");
        $stmt->execute([$skupina['id']]);
        $clenove = $stmt->fetchAll();

        $stmt = $pdo->prepare("
            SELECT o.odborka_id, o.stav, o.v_seznamu_prani, u.prezdivka 
            FROM odborky_uzivatele o 
            JOIN clenove_skupiny cs ON o.uzivatel_id = cs.uzivatel_id 
            JOIN uzivatele u ON u.id = cs.uzivatel_id
            WHERE cs.skupina_id = ? AND (o.stav IN ('splneno', 'plnim') OR o.v_seznamu_prani = 1)
        ");
        $stmt->execute([$skupina['id']]);
        $agregace = [];
        
        foreach ($stmt->fetchAll() as $row) {
            $odb = $row['odborka_id'];
            if (!isset($agregace[$odb])) {
                $agregace[$odb] = ['splneno' => [], 'chci_plnit' => [], 'plnim' => []];
            }
            if ($row['stav'] === 'splneno') $agregace[$odb]['splneno'][] = $row['prezdivka'];
            if ($row['stav'] === 'plnim') $agregace[$odb]['plnim'][] = $row['prezdivka'];
            if ($row['v_seznamu_prani'] == 1) $agregace[$odb]['chci_plnit'][] = $row['prezdivka'];
        }

        echo json_encode([
            'skupina' => [
                'nazev' => $skupina['nazev'],
                'popis' => $skupina['popis'],
                'je_admin' => $jeAdmin,
                'pozvaci_kod' => $jeAdmin ? $skupina['pozvaci_kod'] : null
            ],
            'clenove' => $clenove,
            'agregace' => $agregace
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($akce === 'detail_clena') {
        $clenId = $_GET['clen_id'] ?? null;
        
        $stmt = $pdo->prepare("
            SELECT 1 FROM clenove_skupiny c1 
            JOIN clenove_skupiny c2 ON c1.skupina_id = c2.skupina_id 
            WHERE c1.uzivatel_id = ? AND c2.uzivatel_id = ?
        ");
        $stmt->execute([$uzivatelId, $clenId]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['chyba' => 'K tomuto profilu nemáte přístup.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT prezdivka, vekova_kategorie FROM uzivatele WHERE id = ?");
        $stmt->execute([$clenId]);
        $clenData = $stmt->fetch();

        $stmt = $pdo->prepare("SELECT odborka_id, stav, v_seznamu_prani FROM odborky_uzivatele WHERE uzivatel_id = ? AND (stav IN ('splneno', 'plnim') OR v_seznamu_prani = 1)");
        $stmt->execute([$clenId]);
        $odborky = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT odborka_id, ukol_id, stav FROM splnene_ukoly WHERE uzivatel_id = ?");
        $stmt->execute([$clenId]);
        $ukoly = $stmt->fetchAll();

        echo json_encode([
            'prezdivka' => $clenData['prezdivka'], 
            'vekova_kategorie' => $clenData['vekova_kategorie'], 
            'odborky' => $odborky,
            'splnene_ukoly' => $ukoly
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// =========================================
// 4. POST: Ukládání změn
// =========================================
if ($metoda === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $akce = $data['akce'] ?? '';

    $cleanup_sql = "DELETE FROM odborky_uzivatele WHERE uzivatel_id = ? AND stav IS NULL AND v_seznamu_prani = 0";

    if ($akce === 'prepnout_ukol') {
        $odborkaId = $data['odborka_id'] ?? null;
        $ukolId = $data['ukol_id'] ?? null;
        $stav = $data['stav'] ?? null;
        if (!$odborkaId || !$ukolId) { http_response_code(400); exit; }

        if ($stav && in_array($stav, ['chci_plnit', 'splneno'])) {
            $stmt = $pdo->prepare("INSERT INTO splnene_ukoly (uzivatel_id, odborka_id, ukol_id, stav) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE stav = VALUES(stav)");
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
        if (!$odborkaId) { http_response_code(400); exit; }

        if ($stav && in_array($stav, ['plnim', 'splneno'])) {
            $stmt = $pdo->prepare("INSERT INTO odborky_uzivatele (uzivatel_id, odborka_id, stav) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stav = VALUES(stav)");
            $stmt->execute([$uzivatelId, $odborkaId, $stav]);
        } else {
            $stmt = $pdo->prepare("UPDATE odborky_uzivatele SET stav = NULL WHERE uzivatel_id = ? AND odborka_id = ?");
            $stmt->execute([$uzivatelId, $odborkaId]);
        }
        $pdo->prepare($cleanup_sql)->execute([$uzivatelId]);
        echo json_encode(['uspech' => true]);
        exit;
    }

    if ($akce === 'prepnout_wishlist') {
        $odborkaId = $data['odborka_id'] ?? null;
        $prani = !empty($data['chci_plnit']) ? 1 : 0;
        if (!$odborkaId) { http_response_code(400); exit; }

        $stmt = $pdo->prepare("INSERT INTO odborky_uzivatele (uzivatel_id, odborka_id, v_seznamu_prani) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v_seznamu_prani = VALUES(v_seznamu_prani)");
        $stmt->execute([$uzivatelId, $odborkaId, $prani]);
        
        $pdo->prepare($cleanup_sql)->execute([$uzivatelId]);
        echo json_encode(['uspech' => true]);
        exit;
    }

    if ($akce === 'zmenit_kategorii') {
        $kategorie = $data['vekova_kategorie'] ?? '';
        $stmt = $pdo->prepare("UPDATE uzivatele SET vekova_kategorie = ? WHERE id = ?");
        $stmt->execute([$kategorie, $uzivatelId]);
        echo json_encode(['uspech' => true]);
        exit;
    }

    if ($akce === 'zmenit_heslo') {
        $stare = $data['stare_heslo'] ?? '';
        $nove = $data['nove_heslo'] ?? '';
        $stmt = $pdo->prepare("SELECT heslo FROM uzivatele WHERE id = ?");
        $stmt->execute([$uzivatelId]);
        $user = $stmt->fetch();

        if ($user && password_verify($stare, $user['heslo'])) {
            $stmt = $pdo->prepare("UPDATE uzivatele SET heslo = ? WHERE id = ?");
            $stmt->execute([password_hash($nove, PASSWORD_DEFAULT), $uzivatelId]);
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['chyba' => 'Staré heslo není správné.']);
        }
        exit;
    }

    // Skupinové akce
    if ($akce === 'pripojit_skupinu') {
        $kod = trim($data['kod'] ?? '');
        $stmt = $pdo->prepare("SELECT id FROM skupiny WHERE pozvaci_kod = ?");
        $stmt->execute([$kod]);
        $skupina = $stmt->fetch();

        if ($skupina) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO clenove_skupiny (skupina_id, uzivatel_id, role) VALUES (?, ?, 'clen')");
            $stmt->execute([$skupina['id'], $uzivatelId]);
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['chyba' => 'Neplatný pozvací kód.']);
        }
        exit;
    }

    if ($akce === 'upravit_popis_skupiny') {
        $popis = $data['popis'] ?? '';
        
        $stmt = $pdo->prepare("SELECT s.id FROM skupiny s JOIN clenove_skupiny cs ON s.id = cs.skupina_id WHERE cs.uzivatel_id = ? AND cs.role = 'admin' LIMIT 1");
        $stmt->execute([$uzivatelId]);
        $skupina = $stmt->fetch();

        if ($skupina) {
            $stmt = $pdo->prepare("UPDATE skupiny SET popis = ? WHERE id = ?");
            $stmt->execute([$popis, $skupina['id']]);
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(403);
            echo json_encode(['chyba' => 'Nemáte administrátorská práva.']);
        }
        exit;
    }

    if ($akce === 'generovat_kod') {
        $novyKod = strtoupper(substr(md5(uniqid((string)rand(), true)), 0, 8));
        
        $stmt = $pdo->prepare("SELECT s.id FROM skupiny s JOIN clenove_skupiny cs ON s.id = cs.skupina_id WHERE cs.uzivatel_id = ? AND cs.role = 'admin' LIMIT 1");
        $stmt->execute([$uzivatelId]);
        $skupina = $stmt->fetch();
        
        if ($skupina) {
            $stmt = $pdo->prepare("UPDATE skupiny SET pozvaci_kod = ? WHERE id = ?");
            $stmt->execute([$novyKod, $skupina['id']]);
            echo json_encode(['uspech' => true, 'kod' => $novyKod]);
        } else {
            http_response_code(403);
            echo json_encode(['chyba' => 'Nemáte administrátorská práva.']);
        }
        exit;
    }

    if ($akce === 'vyhodit_clena') {
        $clenId = $data['clen_id'] ?? null;
        if (!$clenId) { http_response_code(400); exit; }
        
        if ($clenId == $uzivatelId) { 
            http_response_code(400); 
            echo json_encode(['chyba' => 'Nemůžete vyhodit sami sebe.']); 
            exit; 
        }

        $stmt = $pdo->prepare("SELECT s.id FROM skupiny s JOIN clenove_skupiny cs ON s.id = cs.skupina_id WHERE cs.uzivatel_id = ? AND cs.role = 'admin' LIMIT 1");
        $stmt->execute([$uzivatelId]);
        $skupinaId = $stmt->fetchColumn();

        if ($skupinaId) {
            $stmt = $pdo->prepare("DELETE FROM clenove_skupiny WHERE skupina_id = ? AND uzivatel_id = ?");
            $stmt->execute([$skupinaId, $clenId]);
            echo json_encode(['uspech' => true]);
        } else {
            http_response_code(403); 
            echo json_encode(['chyba' => 'Nemáte administrátorská práva.']);
        }
        exit;
    }

    http_response_code(400);
    echo json_encode(['chyba' => 'Neznámá akce.']);
    exit;
}