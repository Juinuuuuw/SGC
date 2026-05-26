<?php
// api/sincronizar.php
// Recebe em lote as operações pendentes do cliente offline (vendas + movimentações)
// e as processa com detecção de conflito de estoque.
//
// POST body: { vendas: [...], movimentacoes: [...] }
// Response:  { vendas: [{ id_local, success, id_servidor, furo_estoque, message }], movimentacoes: [...] }

header('Content-Type: application/json; charset=utf-8');
require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido.']);
    exit;
}

$id_empresa = (int)$_SESSION['empresa_id'];
$id_usuario = (int)($_SESSION['usuario_id'] ?? 0);
$payload    = json_decode(file_get_contents('php://input'), true);

if (!$payload) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Payload inválido.']);
    exit;
}

$resultadoVendas       = [];
$resultadoMovimentacoes= [];

// ════════════════════════════════════════════════════════════
//  PROCESSAR VENDAS
// ════════════════════════════════════════════════════════════
foreach (($payload['vendas'] ?? []) as $venda) {
    $id_local = $venda['id_local'] ?? null;

    try {
        $conn->begin_transaction();

        $id_caixa       = !empty($venda['id_caixa']) ? (int)$venda['id_caixa'] : null;
        $id_caixa_sql   = $id_caixa ? $id_caixa : 'NULL';
        $valor_total    = (float)($venda['valor_total']   ?? 0);
        $valor_desconto = (float)($venda['valor_desconto'] ?? 0);
        $total_final    = max(0, $valor_total - $valor_desconto);
        $forma          = $conn->real_escape_string($venda['forma_pagamento'] ?? 'DINHEIRO');
        $criado_em      = $conn->real_escape_string($venda['criado_em'] ?? date('Y-m-d H:i:s'));

        // Insere a venda (sempre, mesmo com furo de estoque)
        $conn->query("INSERT INTO vendas
            (id_empresa, id_usuario, id_caixa, data_venda, total, forma_pagamento, status)
            VALUES ($id_empresa, $id_usuario, $id_caixa_sql, '$criado_em', $total_final, '$forma', 'Finalizada')");

        $id_venda    = $conn->insert_id;
        $furoEstoque = false;
        $itensFuro   = [];

        foreach (($venda['itens'] ?? []) as $item) {
            $id_produto  = (int)$item['id_produto'];
            $quantidade  = (float)$item['quantidade'];
            $preco       = (float)$item['preco_unitario'];
            $subtotal    = $quantidade * $preco;

            // Busca estoque atual
            $row = $conn->query("SELECT id, nome, estoque FROM produtos
                WHERE id = $id_produto AND id_empresa = $id_empresa LIMIT 1")->fetch_assoc();

            if (!$row) {
                throw new Exception("Produto ID $id_produto não encontrado nesta empresa.");
            }

            // ── Detecção de conflito de estoque ───────────────────
            $estoque_atual = (float)$row['estoque'];
            $furo_este_item = $estoque_atual < $quantidade;
            if ($furo_este_item) {
                $furoEstoque = true;
                $itensFuro[] = [
                    'nome'            => $row['nome'],
                    'estoque_atual'   => $estoque_atual,
                    'qtd_vendida'     => $quantidade,
                    'furo'            => $quantidade - $estoque_atual,
                ];
                // Registra log de furo de estoque
                $nomeProd   = $conn->real_escape_string($row['nome']);
                $diff       = $quantidade - $estoque_atual;
                $conn->query("INSERT IGNORE INTO log_furos_estoque
                    (id_empresa, id_produto, nome_produto, id_venda, qtd_vendida, estoque_disponivel, diferenca, data_furo)
                    SELECT $id_empresa, $id_produto, '$nomeProd', $id_venda,
                           $quantidade, $estoque_atual, $diff, NOW()
                    FROM DUAL
                    WHERE EXISTS (SHOW TABLES LIKE 'log_furos_estoque')");
                // Mesmo com furo: zera o estoque (não vai para negativo)
                $conn->query("UPDATE produtos SET estoque = 0 WHERE id = $id_produto");
            } else {
                $conn->query("UPDATE produtos SET estoque = estoque - $quantidade WHERE id = $id_produto");
            }

            // Insere item da venda
            $conn->query("INSERT INTO itens_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal)
                VALUES ($id_venda, $id_produto, $quantidade, $preco, $subtotal)");
        }

        $conn->commit();

        $resultadoVendas[] = [
            'id_local'    => $id_local,
            'success'     => true,
            'id_servidor' => $id_venda,
            'furo_estoque'=> $furoEstoque,
            'itens_furo'  => $itensFuro,
            'message'     => $furoEstoque
                ? 'Venda registrada com furo de estoque em ' . count($itensFuro) . ' item(s).'
                : 'OK',
        ];

    } catch (Exception $e) {
        $conn->rollback();
        $resultadoVendas[] = [
            'id_local'    => $id_local,
            'success'     => false,
            'furo_estoque'=> false,
            'message'     => $e->getMessage(),
        ];
    }
}

// ════════════════════════════════════════════════════════════
//  PROCESSAR MOVIMENTAÇÕES
// ════════════════════════════════════════════════════════════
foreach (($payload['movimentacoes'] ?? []) as $mov) {
    $id_local = $mov['id_local'] ?? null;

    try {
        $conn->begin_transaction();

        $tipo   = $conn->real_escape_string($mov['tipo']   ?? 'entrada');
        $motivo = $conn->real_escape_string($mov['motivo'] ?? 'Offline');

        $conn->query("INSERT INTO movimentacoes (id_empresa, tipo, motivo)
            VALUES ($id_empresa, '$tipo', '$motivo')");
        $id_mov = $conn->insert_id;

        foreach (($mov['itens'] ?? []) as $item) {
            $id_produto = (int)$item['id'];
            $quantidade = (float)$item['quantidade'];

            $conn->query("INSERT INTO itens_movimentacao (id_movimentacao, id_produto, quantidade)
                VALUES ($id_mov, $id_produto, $quantidade)");

            if ($tipo === 'entrada') {
                $conn->query("UPDATE produtos SET estoque = estoque + $quantidade WHERE id = $id_produto AND id_empresa = $id_empresa");
            } else {
                $conn->query("UPDATE produtos SET estoque = GREATEST(0, estoque - $quantidade) WHERE id = $id_produto AND id_empresa = $id_empresa");
            }
        }

        $conn->commit();
        $resultadoMovimentacoes[] = ['id_local' => $id_local, 'success' => true, 'id_servidor' => $id_mov];

    } catch (Exception $e) {
        $conn->rollback();
        $resultadoMovimentacoes[] = ['id_local' => $id_local, 'success' => false, 'message' => $e->getMessage()];
    }
}

// ── Resposta final ────────────────────────────────────────────
echo json_encode([
    'success'       => true,
    'vendas'        => $resultadoVendas,
    'movimentacoes' => $resultadoMovimentacoes,
    'sincronizado_em' => date('Y-m-d H:i:s'),
]);
