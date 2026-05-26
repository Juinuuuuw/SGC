<?php
// api/perfis.php — CRUD de Perfis e Permissões
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

        // ── Listar perfis com suas permissões ──────────────────
        case 'GET':
            // Todos os módulos
            $mods = $conn->query("SELECT * FROM modulos ORDER BY nome")->fetch_all(MYSQLI_ASSOC);

            // Perfis da empresa
            $stmt = $conn->prepare("SELECT * FROM perfis WHERE id_empresa = ? ORDER BY nome");
            $stmt->bind_param("i", $id_empresa); $stmt->execute();
            $perfis = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

            // Permissões de cada perfil
            foreach ($perfis as &$perfil) {
                $stmt2 = $conn->prepare("
                    SELECT m.identificador, pe.pode_acessar
                    FROM permissoes pe
                    JOIN modulos m ON m.id = pe.id_modulo
                    WHERE pe.id_perfil = ?
                ");
                $stmt2->bind_param("i", $perfil['id']); $stmt2->execute();
                $rows = $stmt2->get_result()->fetch_all(MYSQLI_ASSOC);
                $perfil['permissoes'] = [];
                foreach ($rows as $r) {
                    $perfil['permissoes'][$r['identificador']] = (bool)$r['pode_acessar'];
                }
            }

            echo json_encode(['success' => true, 'perfis' => $perfis, 'modulos' => $mods]);
            break;

        // ── Criar perfil ───────────────────────────────────────
        case 'POST':
            $d          = json_decode(file_get_contents('php://input'), true);
            $nome       = trim($d['nome']     ?? '');
            $descricao  = trim($d['descricao'] ?? '');
            $permissoes = $d['permissoes']     ?? []; // { "pdv": true, "produtos": false, ... }

            if (!$nome) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Nome do perfil é obrigatório.']); exit; }

            $conn->begin_transaction();

            $stmt = $conn->prepare("INSERT INTO perfis (id_empresa, nome, descricao) VALUES (?, ?, ?)");
            $stmt->bind_param("iss", $id_empresa, $nome, $descricao);
            $stmt->execute();
            $id_perfil = $stmt->insert_id;

            // Insere as permissões
            $stmt2 = $conn->prepare("INSERT INTO permissoes (id_perfil, id_modulo, pode_acessar) VALUES (?, ?, ?)");
            $mods  = $conn->query("SELECT id, identificador FROM modulos")->fetch_all(MYSQLI_ASSOC);
            foreach ($mods as $mod) {
                $acesso = isset($permissoes[$mod['identificador']]) && $permissoes[$mod['identificador']] ? 1 : 0;
                $stmt2->bind_param("iii", $id_perfil, $mod['id'], $acesso);
                $stmt2->execute();
            }

            $conn->commit();
            echo json_encode(['success' => true, 'id' => $id_perfil, 'message' => 'Perfil criado com sucesso!']);
            break;

        // ── Atualizar perfil e permissões ──────────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $d          = json_decode(file_get_contents('php://input'), true);
            $nome       = trim($d['nome']      ?? '');
            $descricao  = trim($d['descricao'] ?? '');
            $permissoes = $d['permissoes']      ?? [];

            $conn->begin_transaction();

            $stmt = $conn->prepare("UPDATE perfis SET nome=?, descricao=? WHERE id=? AND id_empresa=?");
            $stmt->bind_param("ssii", $nome, $descricao, $id, $id_empresa);
            $stmt->execute();

            // Atualiza permissões via upsert
            $mods = $conn->query("SELECT id, identificador FROM modulos")->fetch_all(MYSQLI_ASSOC);
            foreach ($mods as $mod) {
                $acesso = isset($permissoes[$mod['identificador']]) && $permissoes[$mod['identificador']] ? 1 : 0;
                $stmt2  = $conn->prepare("
                    INSERT INTO permissoes (id_perfil, id_modulo, pode_acessar)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE pode_acessar = VALUES(pode_acessar)
                ");
                $stmt2->bind_param("iii", $id, $mod['id'], $acesso);
                $stmt2->execute();
            }

            $conn->commit();
            echo json_encode(['success' => true, 'message' => 'Perfil atualizado com sucesso!']);
            break;

        // ── Excluir perfil ─────────────────────────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }

            // Verifica se há usuários usando este perfil
            $chk = $conn->prepare("SELECT COUNT(*) FROM usuarios WHERE id_perfil = ? AND id_empresa = ?");
            $chk->bind_param("ii", $id, $id_empresa); $chk->execute();
            if ($chk->get_result()->fetch_row()[0] > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Existem usuários com este perfil. Reatribua-os antes de excluir.']);
                exit;
            }

            $stmt = $conn->prepare("DELETE FROM perfis WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa); $stmt->execute();
            echo json_encode(['success' => $stmt->affected_rows > 0, 'message' => 'Perfil excluído!']);
            break;
    }
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
