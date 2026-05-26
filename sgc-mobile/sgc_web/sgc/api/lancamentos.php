<?php
// api/lancamentos.php — CRUD de Lançamentos Financeiros
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

        // ── Listar com joins ───────────────────────────────────
        case 'GET':
            $where   = "l.id_empresa = ?";
            $params  = [$id_empresa];
            $types   = "i";

            // Filtros opcionais
            if (!empty($_GET['tipo']))   { $where .= " AND l.tipo = ?";   $params[] = $_GET['tipo'];   $types .= "s"; }
            if (!empty($_GET['status'])) { $where .= " AND l.status = ?"; $params[] = $_GET['status']; $types .= "s"; }
            if (!empty($_GET['de']))     { $where .= " AND l.data_vencimento >= ?"; $params[] = $_GET['de']; $types .= "s"; }
            if (!empty($_GET['ate']))    { $where .= " AND l.data_vencimento <= ?"; $params[] = $_GET['ate']; $types .= "s"; }

            $stmt = $conn->prepare("
                SELECT l.*,
                       p.nome AS categoria_nome,
                       c.nome AS conta_nome
                FROM lancamentos_financeiros l
                LEFT JOIN plano_de_contas   p ON p.id = l.id_categoria
                LEFT JOIN contas_financeiras c ON c.id = l.id_conta
                WHERE $where
                ORDER BY l.data_vencimento DESC
                LIMIT 200
            ");
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;

        // ── Criar ─────────────────────────────────────────────
        case 'POST':
            $d          = json_decode(file_get_contents('php://input'), true);
            $tipo       = $d['type']       ?? '';
            $descricao  = trim($d['description'] ?? '');
            $valor      = (float)($d['value'] ?? 0);
            $vencimento = $d['dueDate']    ?? '';
            $catId      = !empty($d['categoryId']) ? (int)$d['categoryId'] : null;
            $contaId    = !empty($d['accountId'])  ? (int)$d['accountId']  : null;
            $status     = $d['status']     ?? 'Pendente';

            if (!$tipo || !$descricao || !$valor || !$vencimento) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Campos obrigatórios faltando.']);
                exit;
            }

            $stmt = $conn->prepare("
                INSERT INTO lancamentos_financeiros
                    (id_empresa, tipo, descricao, valor, data_vencimento, id_categoria, id_conta, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->bind_param("issdsiss", $id_empresa, $tipo, $descricao, $valor, $vencimento, $catId, $contaId, $status);
            $stmt->execute();
            $newId = $stmt->insert_id;

            // Atualiza saldo da conta se status = Pago
            if ($status === 'Pago' && $contaId) {
                $delta = ($tipo === 'receita') ? $valor : -$valor;
                $upd   = $conn->prepare("UPDATE contas_financeiras SET saldo_atual = saldo_atual + ? WHERE id = ?");
                $upd->bind_param("di", $delta, $contaId);
                $upd->execute();
            }

            echo json_encode(['success' => true, 'id' => $newId, 'message' => 'Lançamento salvo com sucesso!']);
            break;

        // ── Atualizar (ex: marcar como pago) ──────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $d = json_decode(file_get_contents('php://input'), true);

            // Busca estado anterior para ajustar saldo se necessário
            $prev = $conn->prepare("SELECT tipo, valor, id_conta, status FROM lancamentos_financeiros WHERE id = ? AND id_empresa = ?");
            $prev->bind_param("ii", $id, $id_empresa);
            $prev->execute();
            $old = $prev->get_result()->fetch_assoc();
            if (!$old) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Lançamento não encontrado.']); exit; }

            $novo_status = $d['status'] ?? $old['status'];
            $pagamento   = !empty($d['data_pagamento']) ? $d['data_pagamento'] : null;

            $stmt = $conn->prepare("
                UPDATE lancamentos_financeiros
                SET status = ?, data_pagamento = ?
                WHERE id = ? AND id_empresa = ?
            ");
            $stmt->bind_param("ssii", $novo_status, $pagamento, $id, $id_empresa);
            $stmt->execute();

            // Ajusta saldo se mudou de/para Pago
            if ($old['id_conta'] && $old['status'] !== $novo_status) {
                $delta = ($old['tipo'] === 'receita') ? (float)$old['valor'] : -(float)$old['valor'];
                if ($novo_status === 'Pago') {
                    $upd = $conn->prepare("UPDATE contas_financeiras SET saldo_atual = saldo_atual + ? WHERE id = ?");
                    $upd->bind_param("di", $delta, $old['id_conta']);
                } else { // Revertendo pagamento
                    $delta = -$delta;
                    $upd = $conn->prepare("UPDATE contas_financeiras SET saldo_atual = saldo_atual + ? WHERE id = ?");
                    $upd->bind_param("di", $delta, $old['id_conta']);
                }
                $upd->execute();
            }

            echo json_encode(['success' => true, 'message' => 'Lançamento atualizado!']);
            break;

        // ── Excluir ───────────────────────────────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $stmt = $conn->prepare("DELETE FROM lancamentos_financeiros WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => $stmt->affected_rows > 0, 'message' => 'Lançamento excluído!']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
