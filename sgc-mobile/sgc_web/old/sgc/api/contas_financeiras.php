<?php
// api/contas_financeiras.php — CRUD das Contas / Caixas Financeiros
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) { http_response_code(401); echo json_encode(['success' => false, 'message' => 'Não autorizado']); exit; }

$id_empresa = (int)$_SESSION['empresa_id'];
$method     = $_SERVER['REQUEST_METHOD'];
$id         = isset($_GET['id']) ? (int)$_GET['id'] : null;

try {
    switch ($method) {

        case 'GET':
            $stmt = $conn->prepare("SELECT * FROM contas_financeiras WHERE id_empresa = ? ORDER BY nome");
            $stmt->bind_param("i", $id_empresa);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;

        case 'POST':
            $data          = json_decode(file_get_contents('php://input'), true);
            $nome          = trim($data['name'] ?? '');
            $saldo_inicial = (float)($data['initialBalance'] ?? 0);
            $tipo          = $data['tipo'] ?? 'caixa';
            if (!$nome) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Nome obrigatório.']); exit; }
            $stmt = $conn->prepare("INSERT INTO contas_financeiras (id_empresa, nome, tipo, saldo_inicial, saldo_atual) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("issdd", $id_empresa, $nome, $tipo, $saldo_inicial, $saldo_inicial);
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'message' => 'Conta salva com sucesso!']);
            break;

        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            // Verifica se há lançamentos vinculados
            $check = $conn->prepare("SELECT COUNT(*) FROM lancamentos_financeiros WHERE id_conta = ?");
            $check->bind_param("i", $id);
            $check->execute();
            if ($check->get_result()->fetch_row()[0] > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Existem lançamentos vinculados a esta conta. Exclua-os primeiro.']);
                exit;
            }
            $stmt = $conn->prepare("DELETE FROM contas_financeiras WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => $stmt->affected_rows > 0, 'message' => 'Conta excluída!']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
