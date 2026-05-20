<?php
// api/caixa.php — Gerenciamento de Caixa para o PDV Mobile
require 'conexao.php';
require 'sessao.php';
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;
$idUsuario = $_SESSION['usuario_id'] ?? null;

if (!$idEmpresa) {
    echo json_encode(["success" => false, "message" => "Não autenticado."]);
    exit;
}

if ($method === 'GET') {
    $status = $conn->real_escape_string($_GET['status'] ?? 'ABERTO');

    $sql = "SELECT c.*, u.nome as nome_usuario
            FROM caixas_pdv c
            LEFT JOIN usuarios u ON c.id_usuario = u.id
            WHERE c.id_usuario = $idUsuario AND c.status = '$status'
            ORDER BY c.data_abertura DESC
            LIMIT 1";

    $res = $conn->query($sql);
    if ($res && $res->num_rows > 0) {
        echo json_encode($res->fetch_assoc());
    } else {
        echo json_encode(null);
    }
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $acao = $data['acao'] ?? '';

    if ($acao === 'ABRIR') {
        $saldoInicial = floatval($data['saldo_inicial'] ?? 0);

        // Verifica se já existe caixa aberto
        $check = $conn->query("SELECT id FROM caixas_pdv WHERE id_usuario = $idUsuario AND status = 'ABERTO' LIMIT 1");
        if ($check && $check->num_rows > 0) {
            $caixa = $check->fetch_assoc();
            echo json_encode(["success" => true, "caixa" => $caixa, "message" => "Caixa já estava aberto."]);
            exit;
        }

        $sql = "INSERT INTO caixas_pdv (id_usuario, data_abertura, saldo_inicial, saldo_atual, status)
                VALUES ($idUsuario, NOW(), $saldoInicial, $saldoInicial, 'ABERTO')";

        if ($conn->query($sql)) {
            $id = $conn->insert_id;
            echo json_encode(["success" => true, "id" => $id, "caixa" => ["id" => $id]]);
        } else {
            echo json_encode(["success" => false, "message" => $conn->error]);
        }
        exit;
    }

    if ($acao === 'FECHAR') {
        $idCaixa = intval($data['id_caixa'] ?? 0);
        $saldoFechamento = floatval($data['saldo_fechamento'] ?? 0);
        $obs = $conn->real_escape_string($data['observacoes'] ?? '');

        $sql = "UPDATE caixas_pdv SET
                    status = 'FECHADO',
                    data_fechamento = NOW(),
                    saldo_fechamento = $saldoFechamento,
                    observacoes = '$obs'
                WHERE id = $idCaixa AND id_usuario = $idUsuario";

        if ($conn->query($sql)) {
            echo json_encode(["success" => true, "message" => "Caixa fechado com sucesso."]);
        } else {
            echo json_encode(["success" => false, "message" => $conn->error]);
        }
        exit;
    }

    echo json_encode(["success" => false, "message" => "Ação inválida."]);
}
