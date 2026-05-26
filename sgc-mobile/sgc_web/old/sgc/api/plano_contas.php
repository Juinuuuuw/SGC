<?php
// api/plano_contas.php — CRUD do Plano de Contas
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

        // ── Listar ────────────────────────────────────────────
        case 'GET':
            $stmt = $conn->prepare("SELECT * FROM plano_de_contas WHERE id_empresa = ? ORDER BY tipo, nome");
            $stmt->bind_param("i", $id_empresa);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;

        // ── Criar ─────────────────────────────────────────────
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            $nome = trim($data['nome'] ?? '');
            $tipo = $data['tipo'] ?? '';
            if (!$nome || !in_array($tipo, ['receita','despesa'])) {
                http_response_code(400); echo json_encode(['success' => false, 'message' => 'Nome e tipo são obrigatórios.']); exit;
            }
            $stmt = $conn->prepare("INSERT INTO plano_de_contas (id_empresa, nome, tipo) VALUES (?, ?, ?)");
            $stmt->bind_param("iss", $id_empresa, $nome, $tipo);
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'message' => 'Categoria salva com sucesso!']);
            break;

        // ── Atualizar ─────────────────────────────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            $nome = trim($data['nome'] ?? '');
            $tipo = $data['tipo'] ?? '';
            $stmt = $conn->prepare("UPDATE plano_de_contas SET nome = ?, tipo = ? WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ssii", $nome, $tipo, $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Categoria atualizada!']);
            break;

        // ── Excluir ───────────────────────────────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $stmt = $conn->prepare("DELETE FROM plano_de_contas WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => $stmt->affected_rows > 0, 'message' => 'Categoria excluída!']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
