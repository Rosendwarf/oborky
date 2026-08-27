<?php
// Připojení k databázi (stejné parametry jako v api.php)
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

    $prezdivka = 'Nekdo';
    $heslo = 'neco';
    $vekova_kategorie = 'starsi_skauti';

    // Zahashování hesla aktuálním PHP serverem
    $hash = password_hash($heslo, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("INSERT INTO uzivatele (prezdivka, heslo, vekova_kategorie) VALUES (?, ?, ?)");
    $stmt->execute([$prezdivka, $hash, $vekova_kategorie]);

    echo "Uživatel 'Vojta' s heslem 'heslo123' byl úspěšně vytvořen! Nyní se můžeš přihlásit.";

} catch (PDOException $e) {
    echo "Chyba: " . $e->getMessage();
}