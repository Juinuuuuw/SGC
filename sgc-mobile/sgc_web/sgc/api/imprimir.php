<?php
// api/imprimir.php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Método não permitido"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (empty($input['data'])) {
    echo json_encode(["success" => false, "message" => "Nenhum comando de impressão"]);
    exit;
}

$comando = base64_decode($input['data']);
if ($comando === false) {
    echo json_encode(["success" => false, "message" => "Dados inválidos"]);
    exit;
}

// ═══════════ CONFIGURAÇÃO DA IMPRESSORA ═══════════
$impressora_ip   = '192.168.0.7';   // IP real da impressora térmica
$impressora_port = 9104;             // porta padrão

// ═══════════ ENVIO VIA TCP ═══════════
$socket = @fsockopen($impressora_ip, $impressora_port, $errno, $errstr, 3);
if (!$socket) {
    echo json_encode([
        "success" => false,
        "message" => "Impressora offline: $errstr ($errno)"
    ]);
    exit;
}

fwrite($socket, $comando);
fclose($socket);

echo json_encode(["success" => true, "message" => "Comando enviado à impressora"]);