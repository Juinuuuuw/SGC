<?php
// api/vendas.php — Registro de Vendas do PDV Mobile
require 'conexao.php';
require 'sessao.php';
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;

if (!$idEmpresa) {
    echo json_encode(["success" => false, "message" => "Não autenticado."]);
    exit;
}

if ($method === 'GET') {
    $sql = "SELECT v.*, c.id as caixa_id,
                   cl.nome as cliente_nome,
                   COUNT(vi.id) as total_itens
            FROM vendas_pdv v
            LEFT JOIN caixas_pdv c ON v.id_caixa = c.id
            LEFT JOIN clientes cl ON v.id_cliente = cl.id
            LEFT JOIN venda_itens vi ON v.id = vi.id_venda
            WHERE c.id_empresa = $idEmpresa
            GROUP BY v.id
            ORDER BY v.data_venda DESC
            LIMIT 50";

    $res = $conn->query($sql);
    $vendas = [];
    while ($row = $res->fetch_assoc()) { $vendas[] = $row; }
    echo json_encode($vendas);
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!isset($data['itens']) || empty($data['itens'])) {
        echo json_encode(["success" => false, "message" => "Nenhum item informado."]);
        exit;
    }

    $idCaixa        = intval($data['id_caixa'] ?? 0);
    $idCliente      = !empty($data['id_cliente']) ? intval($data['id_cliente']) : 'NULL';
    $valorTotal     = floatval($data['valor_total'] ?? 0);
    $valorDesconto  = floatval($data['valor_desconto'] ?? 0);
    $valorAcrescimo = floatval($data['valor_acrescimo'] ?? 0);
    $formaPagto     = $conn->real_escape_string($data['forma_pagamento'] ?? 'DINHEIRO');

    $conn->begin_transaction();

    try {
        // Insere a venda
        $sql = "INSERT INTO vendas_pdv
                    (id_caixa, id_cliente, valor_total, valor_desconto, valor_acrescimo, forma_pagamento, status, data_venda)
                VALUES
                    ($idCaixa, $idCliente, $valorTotal, $valorDesconto, $valorAcrescimo, '$formaPagto', 'FINALIZADA', NOW())";

        $conn->query($sql);
        $idVenda = $conn->insert_id;

        // Insere itens e atualiza estoque
        foreach ($data['itens'] as $item) {
            $idProduto  = intval($item['id_produto']);
            $quantidade = floatval($item['quantidade']);
            $preco      = floatval($item['preco_unitario']);

            // Verifica estoque
            $estoqueRes = $conn->query("SELECT estoque, nome FROM produtos WHERE id = $idProduto LIMIT 1");
            if (!$estoqueRes || $estoqueRes->num_rows === 0) {
                throw new Exception("Produto ID $idProduto não encontrado.");
            }
            $prod = $estoqueRes->fetch_assoc();
            if ($prod['estoque'] < $quantidade) {
                throw new Exception("Estoque insuficiente para '{$prod['nome']}'. Disponível: {$prod['estoque']}.");
            }

            // Insere item da venda
            $conn->query("INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario)
                          VALUES ($idVenda, $idProduto, $quantidade, $preco)");

            // Baixa estoque
            $conn->query("UPDATE produtos SET estoque = estoque - $quantidade WHERE id = $idProduto");
        }

        // Atualiza saldo do caixa
        $valorLiquido = $valorTotal - $valorDesconto + $valorAcrescimo;
        $conn->query("UPDATE caixas_pdv SET saldo_atual = saldo_atual + $valorLiquido WHERE id = $idCaixa");

        $conn->commit();
        echo json_encode([
            "success"  => true,
            "id_venda" => $idVenda,
            "message"  => "Venda registrada com sucesso!",
        ]);

    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
    exit;
}

echo json_encode(["success" => false, "message" => "Método não suportado."]);
