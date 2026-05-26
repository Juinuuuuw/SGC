<?php
// api/mesas.php — CRUD de Mesas (Restaurante)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$id_empresa = (int)$_SESSION['empresa_id'];
$method     = $_SERVER['REQUEST_METHOD'];
$id         = isset($_GET['id']) ? (int)$_GET['id'] : null;

try {
    switch ($method) {

        // ── Listar mesas com total da conta aberta ─────────────
        case 'GET':
            $stmt = $conn->prepare("
                SELECT
                    m.id, m.numero, m.nome, m.capacidade, m.status, m.ativo,
                    v.id            AS venda_id,
                    v.data_venda    AS aberta_em,
                    COALESCE(
                        (SELECT SUM(iv.subtotal)
                         FROM itens_venda iv
                         WHERE iv.id_venda = v.id), 0
                    )               AS total_atual,
                    COALESCE(
                        (SELECT COUNT(iv2.id)
                         FROM itens_venda iv2
                         WHERE iv2.id_venda = v.id), 0
                    )               AS qtd_itens
                FROM mesas m
                LEFT JOIN vendas v
                    ON v.id_mesa = m.id
                   AND v.status  = 'Em Aberto'
                   AND v.id_empresa = m.id_empresa
                WHERE m.id_empresa = ?
                  AND m.ativo      = 1
                ORDER BY m.numero ASC
            ");
            $stmt->bind_param("i", $id_empresa);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;

        // ── Criar mesa ─────────────────────────────────────────
        case 'POST':
            $d = json_decode(file_get_contents('php://input'), true);
            $numero     = (int)($d['numero'] ?? 0);
            $nome       = trim($d['nome']       ?? '');
            $capacidade = (int)($d['capacidade'] ?? 4);

            if (!$numero) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Número da mesa é obrigatório.']);
                exit;
            }

            // Número único por empresa
            $chk = $conn->prepare("SELECT id FROM mesas WHERE id_empresa = ? AND numero = ?");
            $chk->bind_param("ii", $id_empresa, $numero);
            $chk->execute();
            if ($chk->get_result()->num_rows > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => "Mesa $numero já existe."]);
                exit;
            }

            $stmt = $conn->prepare("
                INSERT INTO mesas (id_empresa, numero, nome, capacidade)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->bind_param("iisi", $id_empresa, $numero, $nome, $capacidade);
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'message' => 'Mesa criada!']);
            break;

        // ── Atualizar mesa (dados ou status) ───────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $d = json_decode(file_get_contents('php://input'), true);

            // Atualização de STATUS (ex: 'conta' ou volta para 'livre')
            if (isset($d['status'])) {
                $status = in_array($d['status'], ['livre','ocupada','conta']) ? $d['status'] : 'livre';
                $stmt   = $conn->prepare("UPDATE mesas SET status = ? WHERE id = ? AND id_empresa = ?");
                $stmt->bind_param("sii", $status, $id, $id_empresa);
                $stmt->execute();
                echo json_encode(['success' => true, 'message' => 'Status atualizado!']);
                break;
            }

            // Atualização de DADOS
            $numero     = (int)($d['numero']     ?? 0);
            $nome       = trim($d['nome']        ?? '');
            $capacidade = (int)($d['capacidade'] ?? 4);
            $ativo      = isset($d['ativo']) ? (int)(bool)$d['ativo'] : 1;

            $stmt = $conn->prepare("
                UPDATE mesas SET numero = ?, nome = ?, capacidade = ?, ativo = ?
                WHERE id = ? AND id_empresa = ?
            ");
            $stmt->bind_param("isiiii", $numero, $nome, $capacidade, $ativo, $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Mesa atualizada!']);
            break;

        // ── Excluir mesa (só se estiver livre) ─────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }

            // Verifica se há venda em aberto
            $chk = $conn->prepare("SELECT id FROM vendas WHERE id_mesa = ? AND status = 'Em Aberto' LIMIT 1");
            $chk->bind_param("i", $id);
            $chk->execute();
            if ($chk->get_result()->num_rows > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Feche a conta desta mesa antes de excluí-la.']);
                exit;
            }

            // Soft-delete: desativa
            $stmt = $conn->prepare("UPDATE mesas SET ativo = 0 WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Mesa removida!']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
