<?php
/**
 * Extrakce všech 58 odborek z odborky.pdf v čistém PHP
 * Soubor: extrahuj_vse.php
 */

header('Content-Type: text/plain; charset=utf-8');

$pdfFile = __DIR__ . '/odborky.pdf';
$outputFile = __DIR__ . '/data/badges.json';

if (!file_exists($pdfFile)) {
    die("CHYBA: Soubor odborky.pdf nebyl nalezen v: {$pdfFile}\n");
}

function slugify($text) {
    $text = mb_strtolower($text, 'UTF-8');
    $table = [
        'á'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ň'=>'n','ó'=>'o',
        'ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ý'=>'y','ž'=>'z','/'=>'-',' '=>'-'
    ];
    $text = strtr($text, $table);
    $text = preg_replace('/[^a-z0-9\-]/', '', $text);
    return trim(preg_replace('/-+/', '-', $text), '-');
}

function cleanText($text) {
    $text = str_replace(['fl ash', 'fi lm', 'grafi c', 'pro'], ['flash', 'film', 'grafic', 'pro '], $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

// 1. Načtení a dekomprese PDF streamů
$content = file_get_contents($pdfFile);
preg_match_all('/stream[\r\n]+(.*?)[\r\n]+endstream/s', $content, $streams);

$allText = '';
foreach ($streams[1] as $stream) {
    $uncompressed = @gzuncompress($stream);
    if (!$uncompressed) $uncompressed = @gzinflate($stream);
    if (!$uncompressed) $uncompressed = @gzinflate(substr($stream, 2, -4));

    if ($uncompressed) {
        // Extrakce textu z PDF operátorů Tj a TJ
        if (preg_match_all('/\((.*?)\)\s*Tj/s', $uncompressed, $tjs)) {
            $allText .= "\n" . implode(' ', $tjs[1]);
        }
        if (preg_match_all('/\[(.*?)\]\s*TJ/s', $uncompressed, $tjsArray)) {
            foreach ($tjsArray[1] as $tjGroup) {
                preg_match_all('/\((.*?)\)/s', $tjGroup, $parts);
                $allText .= " " . implode('', $parts[1]);
            }
            $allText .= "\n";
        }
    }
}

// Dekódování PDF escape sekvencí
$allText = stripcslashes($allText);

// 2. Rozdělení na jednotlivé odborky podle klíčového slova
$sections = preg_split('/(?=Skautská odborka\s+[A-ZÁ-Ž])/u', $allText);
$badges = [];

foreach ($sections as $sec) {
    if (!preg_match('/Skautská odborka\s+([A-ZÁ-Ža-zá-ž0-9\s\/–-]+?)\s+(TECHNICKÉ|SPORTOVNÍ|UMĚLECKÉ|PŘÍRODOVĚDECKÉ|PŘÍRODOVĚDNÉ|TÁBORNICKO-CESTOVATELSKÉ|HUMANITNÍ|SLUŽBA BLIŽNÍM|VODÁCKÉ|ŽIVOT V ODDÍLE|DUCHOVNÍ)/u', $sec, $m)) {
        continue;
    }

    $rawName = trim($m[1]);
    $cat = trim($m[2]);

    $categoryMap = [
        'PŘÍRODOVĚDECKÉ' => 'Přírodovědné',
        'PŘÍRODOVĚDNÉ' => 'Přírodovědné',
        'SLUŽBA BLIŽNÍM' => 'Služba bližním',
        'ŽIVOT V ODDÍLE' => 'Život v oddíle',
        'TÁBORNICKO-CESTOVATELSKÉ' => 'Tábornicko-cestovatelské',
        'TECHNICKÉ' => 'Technické',
        'SPORTOVNÍ' => 'Sportovní',
        'UMĚLECKÉ' => 'Umělecké',
        'HUMANITNÍ' => 'Humanitní',
        'VODÁCKÉ' => 'Vodácké',
        'DUCHOVNÍ' => 'Duchovní'
    ];
    $category = $categoryMap[$cat] ?? mb_convert_case($cat, MB_CASE_TITLE, 'UTF-8');
    $slug = slugify(explode('/', $rawName)[0]);

    // Popis / Cíl
    $desc = '';
    if (preg_match('/CÍL:\s*(.*?)(?=\n[A-Z0-9\s\/–-]{4,}|\nPOPIS AKTIVITY|\nZADÁNÍ AKTIVITY|$)/us', $sec, $dm)) {
        $desc = cleanText($dm[1]);
    }

    // Požadavky
    preg_match_all('/\((\d+)\)/', $sec, $rm);
    $req = [
        'mladsi_skauti' => ['dokaz_to' => 2, 'ukaz_se' => 2],
        'starsi_skauti' => ['dokaz_to' => 5, 'ukaz_se' => 4],
        'roveri' => ['dokaz_to' => 8, 'ukaz_se' => 6]
    ];
    if (isset($rm[1]) && count($rm[1]) >= 6) {
        $req = [
            'mladsi_skauti' => ['dokaz_to' => (int)$rm[1][0], 'ukaz_se' => (int)$rm[1][3]],
            'starsi_skauti' => ['dokaz_to' => (int)$rm[1][1], 'ukaz_se' => (int)$rm[1][4]],
            'roveri' => ['dokaz_to' => (int)$rm[1][2], 'ukaz_se' => (int)$rm[1][5]]
        ];
    }

    // Úkoly Dokaž to (A, B, C...)
    $dokazTo = [];
    if (preg_match_all('/(?:^|\n)([A-Z])\s+([^\n•]+?)(?=\n[A-Z]\s+|\n•|\nPOPIS AKTIVITY|\nUKAŽ SE|$)/us', $sec, $dtm, PREG_SET_ORDER)) {
        foreach ($dtm as $dt) {
            $t = cleanText($dt[1] . ' ' . $dt[2]);
            if (mb_strlen($t) > 10 && !str_starts_with($t, 'Já') && !str_starts_with($t, 'Mám')) {
                $dokazTo[] = ['id' => 'dt_' . strtolower($dt[1]), 'title' => $t];
            }
        }
    }

    // Úkoly Ukaž se (1, 2, 3...)
    $ukazSe = [];
    if (preg_match_all('/(?:^|\n)(\d{1,2})\s+([^\n]+?)(?=\n\d{1,2}\s+|\nJá|\nPatron|$)/us', $sec, $usm, PREG_SET_ORDER)) {
        foreach ($usm as $us) {
            $t = cleanText($us[1] . '. ' . $us[2]);
            if (mb_strlen($t) > 6 && !str_starts_with($t, 'Já') && !str_starts_with($t, 'Patron')) {
                $ukazSe[] = ['id' => 'us_' . $us[1], 'title' => $t];
            }
        }
    }

    $badges[$slug] = [
        'id' => $slug,
        'name' => $rawName,
        'category' => $category,
        'description' => $desc,
        'icon' => "{$slug}.svg",
        'methodology_url' => "https://odborky.skauting.cz/odborka/{$slug}/",
        'requirements' => $req,
        'tasks' => [
            'dokaz_to' => $dokazTo,
            'ukaz_se' => $ukazSe
        ]
    ];
    echo "✓ [{$category}] {$rawName} (Dokaž to: " . count($dokazTo) . ", Ukaž se: " . count($ukazSe) . ")\n";
}

$dir = dirname($outputFile);
if (!is_dir($dir)) mkdir($dir, 0777, true);

file_put_contents($outputFile, json_encode($badges, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

echo "\n=======================================================\n";
echo "HOTOVO: Úspěšně vygenerováno " . count($badges) . " odborek.\n";
echo "Uloženo do: {$outputFile}\n";