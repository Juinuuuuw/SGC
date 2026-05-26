<?php
// api/movimentacoes.php — VERSÃO CORRIGIDA
// Mudança: agora salva id_empresa em todas as movimentações, necessário para
//          o Dashboard e Relatórios filtrarem corretamente por empresa.
require_once "conexao.php";
require_once "sessao.php";

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$method    = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;

if (!$idEmpresa) {
    ob_clean();
    echo json_encode(["success" => false, "message" => "Sessão expirada. Faça login novamente."]);
    exit;
}

if ($method === 'GET') {
    // Lista movimentações da empresa (filtra pelo id_empresa salvo)
    $sql = "SELECT m.id, m.tipo, m.motivo, m.data_movimentacao,
                   GROUP_CONCAT(CONCAT(p.nome, ' (', i.quantidade, ')') SEPARATOR ', ') AS itens
            FROM movimentacoes m
            LEFT JOIN itens_movimentacao i ON i.id_movimentacao = m.id
            LEFT JOIN produtos p ON p.id = i.id_produto
            WHERE m.id_empresa = $idEmpresa
            GROUP BY m.id
            ORDER BY m.data_movimentacao DESC";

    $result = $conn->query($sql);
    $movimentacoes = [];
    while ($row = $result->fetch_assoc()) {
        $movimentacoes[] = $row;
    }
    ob_clean();
    echo json_encode($movimentacoes);
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) $data = $_POST;

    if (!isset($data['tipo']) || !isset($data['motivo']) || !isset($data['itens'])) {
        ob_clean();
        echo json_encode(["success" => false, "message" => "Dados inválidos."]);
        exit;
    }

    $tipo   = $conn->real_escape_string($data['tipo']);
    $motivo = $conn->real_escape_string($data['motivo']);

    $conn->begin_transaction();

    try {
        // ↓ CORREÇÃO: inclui id_empresa no INSERT
        $conn->query("INSERT INTO movimentacoes (id_empresa, tipo, motivo)
                      VALUES ($idEmpresa, '$tipo', '$motivo')");
        $movId = $conn->insert_id;

        foreach ($data['itens'] as $item) {
            $produtoId  = (int)$item['id'];
            $quantidade = (float)$item['quantidade'];

            // Verifica se o produto pertence à empresa
            $chk = $conn->query("SELECT id FROM produtos WHERE id = $produtoId AND id_empresa = $idEmpresa LIMIT 1");
            if (!$chk || $chk->num_rows === 0) {
                throw new Exception("Produto ID $produtoId não encontrado nesta empresa.");
            }

            $conn->query("INSERT INTO itens_movimentacao (id_movimentacao, id_produto, quantidade)
                          VALUES ($movId, $produtoId, $quantidade)");

            if ($tipo === 'entrada') {
                $conn->query("UPDATE produtos SET estoque = estoque + $quantidade WHERE id = $produtoId");
            } else {
                // Verifica estoque antes de baixar
                $est = $conn->query("SELECT estoque, nome FROM produtos WHERE id = $produtoId")->fetch_assoc();
                if ($est['estoque'] < $quantidade) {
                    throw new Exception("Estoque insuficiente para '{$est['nome']}'. Disponível: {$est['estoque']}.");
                }
                $conn->query("UPDATE produtos SET estoque = estoque - $quantidade WHERE id = $produtoId");
            }
        }

        $conn->commit();
        ob_clean();
        echo json_encode(["success" => true, "message" => "Movimentação registrada com sucesso!"]);

    } catch (Exception $e) {
        $conn->rollback();
        ob_clean();
        echo json_encode(["success" => false, "message" => "Erro: " . $e->getMessage()]);
    }
    exit;
}

ob_clean();
echo json_encode(["success" => false, "message" => "Método não suportado."]);
?>
