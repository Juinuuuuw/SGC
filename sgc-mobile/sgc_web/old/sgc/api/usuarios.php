<?php
// api/usuarios.php — CRUD de Usuários da Empresa
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) { http_response_code(401); echo json_encode(['success' => false, 'message' => 'Não autorizado']); exit; }

$id_empresa   = (int)$_SESSION['empresa_id'];
$id_logado    = (int)$_SESSION['usuario_id'];
$method       = $_SERVER['REQUEST_METHOD'];
$id           = isset($_GET['id']) ? (int)$_GET['id'] : null;

try {
    switch ($method) {

        // ── Listar usuários com nome do perfil ─────────────────
        case 'GET':
            $stmt = $conn->prepare("
                SELECT u.id, u.nome, u.email, u.ativo, u.criado_em,
                       p.id   AS perfil_id,
                       p.nome AS perfil_nome
                FROM usuarios u
                JOIN perfis p ON p.id = u.id_perfil
                WHERE u.id_empresa = ?
                ORDER BY u.nome
            ");
            $stmt->bind_param("i", $id_empresa);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;

        // ── Criar usuário ──────────────────────────────────────
        case 'POST':
            $d        = json_decode(file_get_contents('php://input'), true);
            $nome     = trim($d['nome']  ?? '');
            $email    = trim($d['email'] ?? '');
            $senha    = $d['senha']      ?? '';
            $id_perfil= (int)($d['id_perfil'] ?? 0);

            if (!$nome || !$email || !$senha || !$id_perfil) {
                http_response_code(400); echo json_encode(['success' => false, 'message' => 'Todos os campos são obrigatórios.']); exit;
            }
            // Verifica e-mail único
            $chk = $conn->prepare("SELECT id FROM usuarios WHERE email = ?");
            $chk->bind_param("s", $email); $chk->execute();
            if ($chk->get_result()->num_rows > 0) {
                http_response_code(409); echo json_encode(['success' => false, 'message' => 'E-mail já cadastrado.']); exit;
            }
            $hash = password_hash($senha, PASSWORD_DEFAULT);
            $stmt = $conn->prepare("INSERT INTO usuarios (id_empresa, id_perfil, nome, email, senha) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("iisss", $id_empresa, $id_perfil, $nome, $email, $hash);
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'message' => 'Usuário criado com sucesso!']);
            break;

        // ── Editar usuário ─────────────────────────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $d         = json_decode(file_get_contents('php://input'), true);
            $nome      = trim($d['nome']     ?? '');
            $email     = trim($d['email']    ?? '');
            $id_perfil = (int)($d['id_perfil'] ?? 0);
            $ativo     = isset($d['ativo']) ? (int)(bool)$d['ativo'] : 1;
            $nova_senha= $d['senha'] ?? '';

            if (!$nome || !$email || !$id_perfil) {
                http_response_code(400); echo json_encode(['success' => false, 'message' => 'Nome, e-mail e perfil são obrigatórios.']); exit;
            }

            if ($nova_senha) {
                $hash = password_hash($nova_senha, PASSWORD_DEFAULT);
                $stmt = $conn->prepare("UPDATE usuarios SET nome=?, email=?, id_perfil=?, ativo=?, senha=? WHERE id=? AND id_empresa=?");
                $stmt->bind_param("ssiisii", $nome, $email, $id_perfil, $ativo, $hash, $id, $id_empresa);
            } else {
                $stmt = $conn->prepare("UPDATE usuarios SET nome=?, email=?, id_perfil=?, ativo=? WHERE id=? AND id_empresa=?");
                $stmt->bind_param("ssiii", $nome, $email, $id_perfil, $ativo, $id, $id_empresa);
                // fix: recount params
                $stmt = $conn->prepare("UPDATE usuarios SET nome=?, email=?, id_perfil=?, ativo=? WHERE id=? AND id_empresa=?");
                $stmt->bind_param("ssiiii", $nome, $email, $id_perfil, $ativo, $id, $id_empresa);
            }
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Usuário atualizado!']);
            break;

        // ── Desativar / Excluir ────────────────────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            if ($id === $id_logado) {
                http_response_code(403); echo json_encode(['success' => false, 'message' => 'Você não pode excluir sua própria conta.']); exit;
            }
            // Soft-delete: desativa em vez de excluir (preserva histórico de vendas)
            $stmt = $conn->prepare("UPDATE usuarios SET ativo = 0 WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Usuário desativado com sucesso.']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
