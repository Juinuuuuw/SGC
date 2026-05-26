<?php
require 'conexao.php';
require 'sessao.php';

error_reporting(0);
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

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

$method = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;
$idUsuario = $_SESSION['usuario_id'] ?? null;

if (!$idEmpresa) {
    if (ob_get_length()) ob_clean();
    echo json_encode(["success" => false, "message" => "Não autenticado."]);
    exit;
}

if ($method === 'GET') {
    try {
        $sql = "SELECT v.id, v.id_caixa as caixa_id, v.data_venda, v.total as valor_total, v.forma_pagamento, v.status,
                       v.cliente_nome_manual, v.cliente_cpf_manual,
                       cl.nome as cliente_nome,
                       COUNT(vi.id) as total_itens
                FROM vendas v
                LEFT JOIN caixas c ON v.id_caixa = c.id
                LEFT JOIN clientes cl ON v.id_cliente = cl.id
                LEFT JOIN itens_venda vi ON v.id = vi.id_venda
                WHERE v.id_empresa = $idEmpresa
                GROUP BY v.id
                ORDER BY v.data_venda DESC
                LIMIT 50";

        $res = $conn->query($sql);
        $vendas = [];
        while ($row = $res->fetch_assoc()) { $vendas[] = $row; }
        
        if (ob_get_length()) ob_clean();
        echo json_encode($vendas);
    } catch (Exception $e) {
        if (ob_get_length()) ob_clean();
        echo json_encode([]);
    }
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) $data = $_POST;

    if (!isset($data['itens']) || empty($data['itens'])) {
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => "Nenhum item informado."]);
        exit;
    }

    $idCaixa        = intval($data['id_caixa'] ?? 0);
    $idCliente      = !empty($data['id_cliente']) ? intval($data['id_cliente']) : 'NULL';
    $nomeManual     = !empty($data['cliente_nome_manual']) ? "'" . $conn->real_escape_string($data['cliente_nome_manual']) . "'" : 'NULL';
    $cpfManual      = !empty($data['cliente_cpf_manual']) ? "'" . $conn->real_escape_string($data['cliente_cpf_manual']) . "'" : 'NULL';
    
    $valorTotal     = floatval($data['valor_total'] ?? 0);
    $valorDesconto  = floatval($data['valor_desconto'] ?? 0);
    $formaPagto     = $conn->real_escape_string($data['forma_pagamento'] ?? 'DINHEIRO');
    
    // Calcula o valor líquido pois a sua tabela tem apenas a coluna "total"
    $valorLiquido   = $valorTotal - $valorDesconto;

    $conn->begin_transaction();

    try {
        // Insere na tabela 'vendas' correta
        $sql = "INSERT INTO vendas
                    (id_empresa, id_usuario, id_cliente, cliente_nome_manual, cliente_cpf_manual, id_caixa, data_venda, total, forma_pagamento, status)
                VALUES
                    ($idEmpresa, $idUsuario, $idCliente, $nomeManual, $cpfManual, $idCaixa, NOW(), $valorLiquido, '$formaPagto', 'Finalizada')";

        $conn->query($sql);
        $idVenda = $conn->insert_id;

        foreach ($data['itens'] as $item) {
            $idProduto  = intval($item['id_produto']);
            $quantidade = floatval($item['quantidade']);
            $preco      = floatval($item['preco_unitario']);
            $subtotal   = $quantidade * $preco;

            $estoqueRes = $conn->query("SELECT estoque, nome FROM produtos WHERE id = $idProduto LIMIT 1");
            if (!$estoqueRes || $estoqueRes->num_rows === 0) {
                throw new Exception("Produto ID $idProduto não encontrado.");
            }
            $prod = $estoqueRes->fetch_assoc();
            if ($prod['estoque'] < $quantidade) {
                throw new Exception("Estoque insuficiente para '{$prod['nome']}'.");
            }

            // Insere na tabela 'itens_venda' correta
            $conn->query("INSERT INTO itens_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal)
                          VALUES ($idVenda, $idProduto, $quantidade, $preco, $subtotal)");

            // Baixa no estoque
            $conn->query("UPDATE produtos SET estoque = estoque - $quantidade WHERE id = $idProduto");
        }

        $conn->commit();
        if (ob_get_length()) ob_clean();
        echo json_encode([
            "success"  => true,
            "id_venda" => $idVenda,
            "message"  => "Venda registrada com sucesso!",
        ]);

    } catch (Exception $e) {
        $conn->rollback();
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
    exit;
}

if (ob_get_length()) ob_clean();
echo json_encode(["success" => false, "message" => "Método não suportado."]);
?>