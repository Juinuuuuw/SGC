<?php
// api/dashboard.php — KPIs reais do banco de dados
header('Content-Type: application/json; charset=utf-8');
require 'conexao.php';
require 'sessao.php';


if (!isset($_SESSION['empresa_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$id_empresa = (int)$_SESSION['empresa_id'];

try {
    // ── Vendas ─────────────────────────────────────────────────
    // Hoje
    $stmt = $conn->prepare("
        SELECT COUNT(*) as qtd, COALESCE(SUM(total), 0) as valor
        FROM vendas
        WHERE id_empresa = ? AND DATE(data_venda) = CURDATE()
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $vendas_hoje = $stmt->get_result()->fetch_assoc();

    // Este mês
    $stmt = $conn->prepare("
        SELECT COUNT(*) as qtd, COALESCE(SUM(total), 0) as valor
        FROM vendas
        WHERE id_empresa = ?
          AND MONTH(data_venda) = MONTH(CURDATE())
          AND YEAR(data_venda)  = YEAR(CURDATE())
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $vendas_mes = $stmt->get_result()->fetch_assoc();

    // Últimos 6 meses (para gráfico)
    $stmt = $conn->prepare("
        SELECT
            DATE_FORMAT(data_venda, '%Y-%m') AS mes,
            DATE_FORMAT(data_venda, '%b/%y')  AS label,
            COALESCE(SUM(total), 0)           AS valor
        FROM vendas
        WHERE id_empresa = ?
          AND data_venda >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(data_venda, '%Y-%m')
        ORDER BY mes ASC
        LIMIT 6
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $grafico_vendas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    // ── Compras ────────────────────────────────────────────────
    $stmt = $conn->prepare("
        SELECT COUNT(*) as qtd, COALESCE(SUM(valor_total), 0) as valor
        FROM compras
        WHERE id_empresa = ?
          AND MONTH(data_emissao) = MONTH(CURDATE())
          AND YEAR(data_emissao)  = YEAR(CURDATE())
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $compras_mes = $stmt->get_result()->fetch_assoc();

    // ── Estoque ────────────────────────────────────────────────
    $stmt = $conn->prepare("
        SELECT
            COUNT(*)                                  AS total_produtos,
            COALESCE(SUM(estoque * preco_custo), 0)   AS valor_estoque,
            SUM(CASE WHEN estoque <= 5 THEN 1 ELSE 0 END) AS produtos_baixo_estoque,
            SUM(CASE WHEN estoque = 0 THEN 1 ELSE 0 END)  AS produtos_sem_estoque
        FROM produtos
        WHERE id_empresa = ?
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $estoque = $stmt->get_result()->fetch_assoc();

    // ── Produtos com estoque baixo (lista) ─────────────────────
    $stmt = $conn->prepare("
        SELECT id, nome, referencia, estoque, unidade_venda, preco_venda
        FROM produtos
        WHERE id_empresa = ? AND estoque <= 5
        ORDER BY estoque ASC
        LIMIT 10
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $lista_baixo_estoque = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    // ── Últimas vendas ─────────────────────────────────────────
    $stmt = $conn->prepare("
        SELECT v.id, v.data_venda, v.total, v.forma_pagamento, v.status,
               u.nome AS operador
        FROM vendas v
        LEFT JOIN usuarios u ON u.id = v.id_usuario
        WHERE v.id_empresa = ?
        ORDER BY v.data_venda DESC
        LIMIT 8
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $ultimas_vendas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    // ── Financeiro resumo ──────────────────────────────────────
    $stmt = $conn->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'receita' AND MONTH(data_vencimento) = MONTH(CURDATE()) THEN valor ELSE 0 END), 0) AS receitas_mes,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' AND MONTH(data_vencimento) = MONTH(CURDATE()) THEN valor ELSE 0 END), 0) AS despesas_mes,
            COALESCE(SUM(CASE WHEN tipo = 'receita' AND status = 'Pendente' THEN valor ELSE 0 END), 0) AS receitas_pendentes,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' AND status = 'Pendente' THEN valor ELSE 0 END), 0) AS despesas_pendentes
        FROM lancamentos_financeiros
        WHERE id_empresa = ?
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $financeiro = $stmt->get_result()->fetch_assoc();

    // ── Produtos mais vendidos ─────────────────────────────────
    $stmt = $conn->prepare("
        SELECT p.nome, SUM(iv.quantidade) AS qtd_vendida, SUM(iv.subtotal) AS total_vendido
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv.id_venda
        JOIN produtos p ON p.id = iv.id_produto
        WHERE v.id_empresa = ?
          AND v.data_venda >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY iv.id_produto
        ORDER BY qtd_vendida DESC
        LIMIT 5
    ");
    $stmt->bind_param("i", $id_empresa);
    $stmt->execute();
    $mais_vendidos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    echo json_encode([
        'success'            => true,
        'vendas_hoje'        => $vendas_hoje,
        'vendas_mes'         => $vendas_mes,
        'compras_mes'        => $compras_mes,
        'estoque'            => $estoque,
        'financeiro'         => $financeiro,
        'grafico_vendas'     => $grafico_vendas,
        'lista_baixo_estoque'=> $lista_baixo_estoque,
        'ultimas_vendas'     => $ultimas_vendas,
        'mais_vendidos'      => $mais_vendidos,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
